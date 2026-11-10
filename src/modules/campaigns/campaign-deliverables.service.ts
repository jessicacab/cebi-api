import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../../common/errors.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { changesAllowed, isLate } from './campaign-pieces.js';
import { fromDay, todayInManila } from './campaign-rules.js';
import type { RequestChangesDto, SubmitPieceDto } from './dto/ongoing.dto.js';

const ONGOING = {
  contentType: true,
  applications: {
    where: { status: 'APPROVED' },
    orderBy: { decidedAt: 'asc' },
    include: {
      creator: { include: { creatorProfile: true } },
      pieces: { orderBy: [{ platform: 'asc' }, { format: 'desc' }, { number: 'asc' }] },
    },
  },
} satisfies Prisma.CampaignInclude;
type OngoingCampaign = Prisma.CampaignGetPayload<{ include: typeof ONGOING }>;

/** A live campaign with its approved creators, their checklists and the numbers the Ongoing tab shows. */
const toOngoing = (c: OngoingCampaign, today: string) => {
  const contentDue = fromDay(c.contentDue);
  const allowed = changesAllowed(c);
  const creators = c.applications.map((a) => {
    const pieces = a.pieces.map((p) => ({
      id: p.id,
      format: p.format,
      platform: p.platform,
      number: p.number,
      minSeconds: p.minSeconds,
      maxSeconds: p.maxSeconds,
      status: p.status,
      late: isLate(p.status, contentDue, today),
      contentUrl: p.contentUrl,
      caption: p.caption,
      originalUrl: p.originalUrl,
      aiEnhanced: p.aiEnhanced,
      submittedAt: p.submittedAt,
      feedback: p.feedback,
      revisionsUsed: p.revisionsUsed,
      changesLeft: Math.max(allowed - p.revisionsUsed, 0),
      approvedAt: p.approvedAt,
    }));
    const done = pieces.filter((p) => p.status === 'APPROVED').length;
    return {
      applicationId: a.id,
      paidAt: a.paidAt,
      done,
      total: pieces.length,
      canMarkPaid: !a.paidAt && c.cashPerCreator !== null && pieces.length > 0 && done === pieces.length,
      creator: {
        id: a.creator.id,
        name: a.creator.name,
        avatarUrl: a.creator.avatarUrl,
        handle: a.creator.creatorProfile?.handle ?? null,
        city: a.creator.creatorProfile?.city ?? null,
        platforms: a.creator.creatorProfile?.platforms ?? [],
        niches: a.creator.creatorProfile?.niches ?? [],
      },
      pieces,
    };
  });
  const all = creators.flatMap((x) => x.pieces);
  const cash = c.cashPerCreator ?? 0;
  return {
    id: c.id,
    title: c.title,
    contentTypeName: c.contentType.name,
    contentDue,
    publishStart: c.publishStart && fromDay(c.publishStart),
    publishEnd: c.publishEnd && fromDay(c.publishEnd),
    slots: c.slots,
    cashPerCreator: c.cashPerCreator,
    reviewDrafts: c.reviewDrafts,
    summary: {
      creators: creators.length,
      pieces: all.length,
      approved: all.filter((p) => p.status === 'APPROVED').length,
      needsReview: all.filter((p) => p.status === 'SUBMITTED').length,
      late: all.filter((p) => p.late).length,
      cashTotal: cash * creators.length,
      cashPaid: cash * creators.filter((x) => x.paidAt).length,
    },
    creators,
  };
};

/** After approval: creators send their content, the business reviews it and marks creators paid. */
@Injectable()
export class CampaignDeliverablesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The business's live campaigns, newest first, for the Ongoing tab. */
  async ongoing(business: User) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { businessId: business.id, status: 'LIVE' },
      include: ONGOING,
      orderBy: { publishedAt: 'desc' },
    });
    const today = todayInManila();
    return campaigns.map((c) => toOngoing(c, today));
  }

  async approve(business: User, pieceId: string) {
    await this.submittedPiece(business, pieceId);
    await this.prisma.creatorDeliverable.updateMany({
      where: { id: pieceId, status: 'SUBMITTED' },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
    return { ok: true };
  }

  /** Sends a piece back with what to fix, within the rounds the campaign allows. */
  async requestChanges(business: User, pieceId: string, dto: RequestChangesDto) {
    const piece = await this.submittedPiece(business, pieceId);
    if (piece.revisionsUsed >= changesAllowed(piece.campaign)) {
      throw apiError(HttpStatus.CONFLICT, 'CHANGES_LIMIT_REACHED', 'You already used all the change requests for this piece.');
    }
    await this.prisma.creatorDeliverable.updateMany({
      where: { id: pieceId, status: 'SUBMITTED' },
      data: { status: 'CHANGES_REQUESTED', feedback: dto.feedback, revisionsUsed: { increment: 1 } },
    });
    return { ok: true };
  }

  /** Stage 1: the business paid the creator directly and records it once all their content is approved. */
  async markPaid(business: User, campaignId: string, applicationId: string) {
    const application = await this.prisma.campaignApplication.findFirst({
      where: { id: applicationId, campaignId, status: 'APPROVED', campaign: { businessId: business.id } },
      include: { campaign: true, pieces: { select: { status: true } } },
    });
    if (!application) throw new NotFoundException('Creator not found on this campaign');
    if (application.campaign.cashPerCreator === null) {
      throw apiError(HttpStatus.CONFLICT, 'NOTHING_TO_PAY', 'This campaign has no cash payment.');
    }
    if (application.paidAt) throw apiError(HttpStatus.CONFLICT, 'ALREADY_PAID', 'You already marked this creator paid.');
    if (!application.pieces.length || application.pieces.some((p) => p.status !== 'APPROVED')) {
      throw apiError(HttpStatus.CONFLICT, 'NOT_ALL_APPROVED', 'Approve all their content before marking them paid.');
    }
    await this.prisma.campaignApplication.update({ where: { id: applicationId }, data: { paidAt: new Date() } });
    return { ok: true };
  }

  /** A creator sends a piece (or a fixed version) for the business to review. */
  async submit(creator: User, pieceId: string, dto: SubmitPieceDto) {
    const piece = await this.prisma.creatorDeliverable.findFirst({
      where: { id: pieceId, application: { creatorId: creator.id, status: 'APPROVED' } },
      include: { campaign: true },
    });
    if (!piece || piece.campaign.status !== 'LIVE') throw new NotFoundException('Not found');
    if (piece.status !== 'TODO' && piece.status !== 'CHANGES_REQUESTED') {
      throw apiError(HttpStatus.CONFLICT, 'ALREADY_SUBMITTED', 'This is already with the business.');
    }
    await this.prisma.creatorDeliverable.update({
      where: { id: pieceId },
      data: {
        status: 'SUBMITTED',
        contentUrl: dto.contentUrl,
        caption: dto.caption ?? null,
        // Marked AI-enhanced when the creator sends the original alongside (Studio's Enhance).
        originalUrl: dto.originalUrl ?? null,
        aiEnhanced: !!dto.originalUrl,
        submittedAt: new Date(),
      },
    });
    return { ok: true };
  }

  /** A piece of one of my live campaigns that is waiting for my review. */
  private async submittedPiece(business: User, pieceId: string) {
    const piece = await this.prisma.creatorDeliverable.findFirst({
      where: { id: pieceId, campaign: { businessId: business.id } },
      include: { campaign: true },
    });
    if (!piece) throw new NotFoundException('Not found');
    if (piece.status !== 'SUBMITTED') {
      throw apiError(HttpStatus.CONFLICT, 'NOT_WAITING_FOR_REVIEW', 'This is not waiting for your review.');
    }
    return piece;
  }
}
