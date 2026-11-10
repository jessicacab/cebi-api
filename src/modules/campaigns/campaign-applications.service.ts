import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../../common/errors.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { piecesFor } from './campaign-pieces.js';
import { fromDay, todayInManila } from './campaign-rules.js';

const WITH_CREATOR = { creator: { include: { creatorProfile: true } } } satisfies Prisma.CampaignApplicationInclude;
type ApplicationWithCreator = Prisma.CampaignApplicationGetPayload<{ include: typeof WITH_CREATOR }>;

const ORDER = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;

/** What the business sees about an application and the creator behind it. */
const toView = (a: ApplicationWithCreator) => ({
  id: a.id,
  status: a.status,
  note: a.note,
  visitTime: a.visitTime,
  createdAt: a.createdAt,
  decidedAt: a.decidedAt,
  creator: {
    id: a.creator.id,
    name: a.creator.name,
    avatarUrl: a.creator.avatarUrl,
    handle: a.creator.creatorProfile?.handle ?? null,
    city: a.creator.creatorProfile?.city ?? null,
    platforms: a.creator.creatorProfile?.platforms ?? [],
    niches: a.creator.creatorProfile?.niches ?? [],
  },
});

/** Creators asking to join live campaigns, and the business approving or declining them. */
@Injectable()
export class CampaignApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Who applied to one of my campaigns, with how many slots are taken. */
  async listForBusiness(business: User, campaignId: string) {
    const campaign = await this.ownCampaign(business, campaignId);
    const rows = await this.prisma.campaignApplication.findMany({
      where: { campaignId },
      include: WITH_CREATOR,
      orderBy: { createdAt: 'asc' },
    });
    const applications = rows.sort((a, b) => ORDER[a.status] - ORDER[b.status]).map(toView);
    return {
      slots: campaign.slots,
      approved: rows.filter((r) => r.status === 'APPROVED').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      applications,
    };
  }

  /** Approves (takes a slot) or declines a waiting application on a live campaign. Decisions are final. */
  async decide(business: User, campaignId: string, applicationId: string, decision: 'APPROVED' | 'DECLINED') {
    const campaign = await this.ownCampaign(business, campaignId);
    if (campaign.status !== 'LIVE') {
      throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_NOT_LIVE', 'Creators can only be approved on a live campaign.');
    }
    await this.prisma.$transaction(async (tx) => {
      const application = await tx.campaignApplication.findFirst({ where: { id: applicationId, campaignId } });
      if (!application) throw new NotFoundException('Application not found');
      if (application.status !== 'PENDING') {
        throw apiError(HttpStatus.CONFLICT, 'APPLICATION_ALREADY_DECIDED', 'You already decided on this creator.');
      }
      if (decision === 'APPROVED') {
        const approved = await tx.campaignApplication.count({ where: { campaignId, status: 'APPROVED' } });
        if (approved >= campaign.slots) {
          throw apiError(HttpStatus.CONFLICT, 'SLOTS_FULL', `All ${campaign.slots} slots are taken.`);
        }
      }
      const { count } = await tx.campaignApplication.updateMany({
        where: { id: applicationId, status: 'PENDING' },
        data: { status: decision, decidedAt: new Date() },
      });
      if (!count) throw apiError(HttpStatus.CONFLICT, 'APPLICATION_ALREADY_DECIDED', 'You already decided on this creator.');
      // An approved creator gets their checklist (see campaign-pieces.ts).
      if (decision === 'APPROVED') {
        await tx.creatorDeliverable.createMany({
          data: piecesFor(campaign, campaign.contentType).map((p) => ({ ...p, applicationId, campaignId })),
        });
      }
    });
    return this.listForBusiness(business, campaignId);
  }

  /**
   * A creator asks to join. The campaign must be live, still taking
   * applications, not full, and on at least one platform the creator uses.
   */
  async apply(creator: User, campaignId: string, note?: string, visitTime?: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { _count: { select: { applications: { where: { status: 'APPROVED' } } } } },
    });
    // Drafts are invisible to creators, so they answer like a missing campaign.
    if (!campaign || campaign.status !== 'LIVE') throw new NotFoundException('Campaign not found');
    if (fromDay(campaign.applyBy) < todayInManila()) {
      throw apiError(HttpStatus.CONFLICT, 'APPLICATIONS_CLOSED', 'Applications for this campaign have closed.');
    }
    if (campaign._count.applications >= campaign.slots) {
      throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_FULL', 'This campaign has all the creators it needs.');
    }
    if (campaign.visitTimes.length && (!visitTime || !campaign.visitTimes.includes(visitTime))) {
      throw new BadRequestException([`visitTime must be one of: ${campaign.visitTimes.join(', ')}`]);
    }
    const profile = await this.prisma.creatorProfile.findUnique({ where: { userId: creator.id } });
    if (!profile?.platforms.some((p) => campaign.platforms.includes(p))) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'NOT_ON_PLATFORM',
        `This campaign is for creators on ${campaign.platforms.join(', ')}.`,
      );
    }
    try {
      const created = await this.prisma.campaignApplication.create({
        data: { campaignId, creatorId: creator.id, note: note || null, visitTime: campaign.visitTimes.length ? visitTime : null },
        include: WITH_CREATOR,
      });
      return toView(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw apiError(HttpStatus.CONFLICT, 'ALREADY_APPLIED', 'You already asked to join this campaign.');
      }
      throw error;
    }
  }

  /** The creator takes back a request the business hasn't answered yet. */
  async withdraw(creator: User, campaignId: string) {
    const application = await this.prisma.campaignApplication.findUnique({
      where: { campaignId_creatorId: { campaignId, creatorId: creator.id } },
    });
    if (!application) throw new NotFoundException('Request not found');
    if (application.status !== 'PENDING') {
      throw apiError(HttpStatus.CONFLICT, 'APPLICATION_ALREADY_DECIDED', 'The business already answered this request.');
    }
    await this.prisma.campaignApplication.deleteMany({ where: { id: application.id, status: 'PENDING' } });
    return { ok: true };
  }

  /** Another business's campaign answers 404, the same as a missing one. */
  private async ownCampaign(business: User, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, businessId: business.id }, include: { contentType: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
}
