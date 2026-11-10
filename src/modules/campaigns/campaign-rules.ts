import type { ContentType } from '../../generated/prisma/client.js';
import type { CreateCampaignDto, PayPart } from './dto/campaign.dto.js';

/** Cebi runs in the Philippines, so "today" is Manila's calendar day (2026-10-13). */
export const todayInManila = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);

/** "2026-10-13" to a Date for a @db.Date column, and back. */
export const toDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
export const fromDay = (date: Date): string => date.toISOString().slice(0, 10);

/** The pieces of the payment: one, or the hybrid's two or more. */
export const payPartsOf = (dto: Pick<CreateCampaignDto, 'payment' | 'hybridParts'>): PayPart[] =>
  dto.payment === 'HYBRID' ? (dto.hybridParts ?? []) : [dto.payment];

/** Problems with how creators are paid, as validation messages. */
export const paymentProblems = (dto: CreateCampaignDto): string[] => {
  const parts = payPartsOf(dto);
  const problems: string[] = [];
  if (dto.payment === 'HYBRID' && parts.length < 2) problems.push('hybridParts must have at least two items');
  if (dto.payment !== 'HYBRID' && dto.hybridParts?.length) problems.push('hybridParts is only for HYBRID');
  if (parts.includes('FIXED') && !dto.cashPerCreator) problems.push('cashPerCreator is required for a fixed payment');
  if (parts.includes('COMMISSION') && !dto.commissionPct) problems.push('commissionPct is required for a commission');
  if (parts.includes('PRODUCT') && !dto.product) problems.push('product is required for a free product');
  return problems;
};

/**
 * Problems with the dates, as validation messages. Applications close first,
 * content is due after that, and when creators post, publishing starts after
 * applications close and ends after the content is due.
 */
export const timelineProblems = (dto: CreateCampaignDto, postsPublicly: boolean, today = todayInManila()): string[] => {
  const problems: string[] = [];
  if (dto.applyBy < today) problems.push('applyBy can not be in the past');
  if (dto.contentDue < dto.applyBy) problems.push('contentDue can not be before applyBy');
  if (!postsPublicly) return problems;
  if (!dto.publishStart || !dto.publishEnd) {
    problems.push('publishStart and publishEnd are required when creators post');
    return problems;
  }
  if (dto.publishStart < dto.applyBy) problems.push('publishStart can not be before applyBy');
  if (dto.publishEnd < dto.publishStart) problems.push('publishEnd can not be before publishStart');
  if (dto.contentDue > dto.publishEnd) problems.push('contentDue can not be after publishEnd');
  return problems;
};

/** Problems with the content type: hidden, or not on every picked platform. */
export const contentTypeProblems = (type: ContentType | null, dto: CreateCampaignDto): string[] => {
  if (!type || !type.active) return ['contentTypeId is not a type businesses can pick'];
  const missing = dto.platforms.filter((p) => !type.platforms.includes(p));
  return missing.length ? [`${type.name} is not available on ${missing.join(', ')}`] : [];
};

/** How money moves: through Cebi with a fee (stage 2), or business to creator directly (stage 1). */
export interface Pricing {
  paymentsInApp: boolean;
  feePercent: number;
}

/**
 * Cash the campaign pays creators (cash per creator times slots). With
 * payments in the app, Cebi's fee is added and the business funds the total
 * through Cebi; otherwise there is no fee and the business pays creators
 * directly. Commissions and free products are never part of it.
 */
export const costOf = (cashPerCreator: number | null, slots: number, pricing: Pricing) => {
  const cash = (cashPerCreator ?? 0) * slots;
  const fee = pricing.paymentsInApp ? Math.round((cash * pricing.feePercent) / 100) : 0;
  return { cash, fee, total: cash + fee, paidInApp: pricing.paymentsInApp };
};
