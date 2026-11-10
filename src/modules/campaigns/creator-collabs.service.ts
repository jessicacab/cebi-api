import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { changesAllowed, isLate } from './campaign-pieces.js';
import { fromDay, todayInManila } from './campaign-rules.js';
import { CARD, toCard } from './creator-card.js';

const WITH_CAMPAIGN = {
  campaign: { include: CARD },
  pieces: { orderBy: [{ platform: 'asc' }, { format: 'desc' }, { number: 'asc' }] },
} satisfies Prisma.CampaignApplicationInclude;
type Collab = Prisma.CampaignApplicationGetPayload<{ include: typeof WITH_CAMPAIGN }>;

/** Approved and either paid, or fully approved with no cash to pay. */
const isDone = (a: Collab) =>
  a.status === 'APPROVED' &&
  (!!a.paidAt || (a.campaign.cashPerCreator === null && a.pieces.length > 0 && a.pieces.every((p) => p.status === 'APPROVED')));

/** The creator's Collabs tab: requests waiting, campaigns they're in, and finished ones. */
@Injectable()
export class CreatorCollabsService {
  constructor(private readonly prisma: PrismaService) {}

  async collabs(creator: User) {
    const today = todayInManila();
    const apps = await this.prisma.campaignApplication.findMany({
      where: { creatorId: creator.id },
      include: WITH_CAMPAIGN,
      orderBy: { createdAt: 'desc' },
    });
    const base = (a: Collab) => ({
      applicationId: a.id,
      status: a.status,
      note: a.note,
      visitTime: a.visitTime,
      appliedAt: a.createdAt,
      decidedAt: a.decidedAt,
      paidAt: a.paidAt,
      campaign: toCard(a.campaign, today),
    });

    const ongoing = apps
      .filter((a) => a.status === 'APPROVED' && !isDone(a))
      .map((a) => {
        const contentDue = fromDay(a.campaign.contentDue);
        const allowed = changesAllowed(a.campaign);
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
          changesLeft: Math.max(allowed - p.revisionsUsed, 0),
          approvedAt: p.approvedAt,
        }));
        return {
          ...base(a),
          contentDue,
          publishStart: a.campaign.publishStart && fromDay(a.campaign.publishStart),
          publishEnd: a.campaign.publishEnd && fromDay(a.campaign.publishEnd),
          reviewDrafts: a.campaign.reviewDrafts,
          done: pieces.filter((p) => p.status === 'APPROVED').length,
          total: pieces.length,
          late: pieces.some((p) => p.late),
          pieces,
        };
      });

    const done = apps.filter(isDone).map((a) => ({ ...base(a), earned: a.paidAt ? (a.campaign.cashPerCreator ?? 0) : 0 }));
    const notDone = apps.filter((a) => a.status === 'APPROVED' && !isDone(a));

    return {
      summary: {
        onTheWay: notDone.reduce((s, a) => s + (a.campaign.cashPerCreator ?? 0), 0),
        earned: done.reduce((s, d) => s + d.earned, 0),
        campaignsDone: done.length,
      },
      pending: apps.filter((a) => a.status === 'PENDING').map(base),
      declined: apps.filter((a) => a.status === 'DECLINED').map(base),
      ongoing,
      done,
    };
  }
}
