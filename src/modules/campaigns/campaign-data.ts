import { Prisma, type ContentType } from '../../generated/prisma/client.js';
import { deliverablesToJson } from '../content-types/deliverables.js';
import { goalsToJson } from './campaign-goals.js';
import { payPartsOf, toDay } from './campaign-rules.js';
import type { CreateCampaignDto } from './dto/campaign.dto.js';

/**
 * The columns to save for a checked campaign, used by create and by editing
 * a draft. Drops what doesn't apply: posting rules when creators don't post
 * (UGC), location and visit times unless creators visit, amounts for payment
 * parts that weren't picked.
 */
export const toCampaignData = (dto: CreateCampaignDto, type: ContentType) => {
  const posts = type.postsOnCreatorAccount;
  const visit = type.requiresVisit;
  const parts = payPartsOf(dto);
  return {
    contentTypeId: type.id,
    title: dto.title,
    platforms: dto.platforms,
    deliverables: deliverablesToJson(dto.deliverables),
    goals: goalsToJson(dto.goals) ?? Prisma.DbNull,
    hashtags: posts ? dto.hashtags : [],
    tagBusiness: posts && dto.tagBusiness,
    mentions: posts ? dto.mentions : [],
    talkingPoints: dto.talkingPoints,
    avoid: dto.avoid,
    link: dto.link || null,
    showLocation: posts && visit && dto.showLocation,
    reviewDrafts: dto.reviewDrafts,
    revisions: dto.reviewDrafts ? dto.revisions : 0,
    keepLiveDays: posts ? (dto.keepLiveDays ?? null) : null,
    adUsageDays: dto.adUsageDays ?? null,
    payment: dto.payment,
    cashPerCreator: parts.includes('FIXED') ? (dto.cashPerCreator ?? null) : null,
    commissionPct: parts.includes('COMMISSION') ? (dto.commissionPct ?? null) : null,
    product: parts.includes('PRODUCT') ? (dto.product ?? null) : null,
    productValue: parts.includes('PRODUCT') ? (dto.productValue ?? null) : null,
    slots: dto.slots,
    applyBy: toDay(dto.applyBy),
    contentDue: toDay(dto.contentDue),
    publishStart: posts ? toDay(dto.publishStart!) : null,
    publishEnd: posts ? toDay(dto.publishEnd!) : null,
    spreadEvenly: posts && dto.spreadEvenly,
    visitTimes: visit ? dto.visitTimes : [],
  } satisfies Prisma.CampaignUncheckedUpdateInput;
};
