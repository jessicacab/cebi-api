import type { Prisma } from '../../generated/prisma/client.js';
import { fromDay } from './campaign-rules.js';

/** What to load for a campaign card a creator sees. */
export const CARD = {
  contentType: true,
  business: { include: { businessProfile: true } },
  _count: { select: { applications: { where: { status: 'APPROVED' } } } },
} satisfies Prisma.CampaignInclude;
export type CardCampaign = Prisma.CampaignGetPayload<{ include: typeof CARD }>;

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** A campaign as creators see it in lists: business, reward, slots left, days left to apply. */
export const toCard = (c: CardCampaign, today: string) => {
  const applyBy = fromDay(c.applyBy);
  return {
    id: c.id,
    title: c.title,
    imageUrl: c.coverUrl ?? c.contentType.imageUrl,
    contentType: {
      name: c.contentType.name,
      slug: c.contentType.slug,
      requiresVisit: c.contentType.requiresVisit,
      postsOnCreatorAccount: c.contentType.postsOnCreatorAccount,
    },
    business: {
      id: c.business.id,
      name: c.business.name,
      avatarUrl: c.business.avatarUrl,
      city: c.business.businessProfile?.city ?? null,
      category: c.business.businessProfile?.category ?? null,
    },
    platforms: c.platforms,
    deliverables: c.deliverables,
    payment: c.payment,
    cashPerCreator: c.cashPerCreator,
    commissionPct: c.commissionPct,
    product: c.product,
    productValue: c.productValue,
    slots: c.slots,
    slotsLeft: Math.max(c.slots - c._count.applications, 0),
    applyBy,
    daysLeft: daysBetween(today, applyBy),
  };
};
