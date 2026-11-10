import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Paginated } from '../../common/dto/pagination.js';
import { apiError } from '../../common/errors.js';
import type { Env } from '../../config/env.js';
import type { Campaign, ContentType, Prisma, User } from '../../generated/prisma/client.js';
import { FileStorage } from '../../integrations/supabase/file-storage.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  contentTypeProblems,
  costOf,
  fromDay,
  paymentProblems,
  timelineProblems,
  todayInManila,
  type Pricing,
} from './campaign-rules.js';
import { estimateViews } from './campaign-estimate.js';
import { toCampaignData } from './campaign-data.js';
import { goalProblems } from './campaign-goals.js';
import type { CreateCampaignDto, EstimateCampaignDto, ListCampaignsQuery, PayPart } from './dto/campaign.dto.js';

/** A file from a multipart upload (multer). */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const WITH_TYPE = {
  contentType: true,
  _count: { select: { applications: { where: { status: 'PENDING' } } } },
} satisfies Prisma.CampaignInclude;
type CampaignWithType = Campaign & { contentType: ContentType; _count: { applications: number } };

/** What the apps receive: calendar days as "2026-10-13", the type's name and picture, and the cost. */
const toView = (c: CampaignWithType, pricing: Pricing) => {
  const { contentType, applyBy, contentDue, publishStart, publishEnd, _count, ...rest } = c;
  const hybridParts: PayPart[] = [
    ...(c.cashPerCreator !== null ? (['FIXED'] as const) : []),
    ...(c.commissionPct !== null ? (['COMMISSION'] as const) : []),
    ...(c.product !== null ? (['PRODUCT'] as const) : []),
  ];
  return {
    ...rest,
    // The whole type, so the app can reopen a draft in the "Create campaign" steps.
    contentType,
    ...(c.payment === 'HYBRID' && { hybridParts }),
    applyBy: fromDay(applyBy),
    contentDue: fromDay(contentDue),
    publishStart: publishStart && fromDay(publishStart),
    publishEnd: publishEnd && fromDay(publishEnd),
    cost: costOf(c.cashPerCreator, c.slots, pricing),
    /** Creators waiting for a decision. */
    pendingApplications: _count.applications,
  };
};
export type CampaignView = ReturnType<typeof toView>;

/** Campaigns businesses post. They start as drafts and go live when the business publishes them. */
@Injectable()
export class CampaignsService {
  private readonly pricing: Pricing;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorage,
    config: ConfigService<Env, true>,
  ) {
    this.pricing = {
      paymentsInApp: config.get('PAYMENTS_IN_APP', { infer: true }),
      feePercent: config.get('CEBI_FEE_PERCENT', { infer: true }),
    };
  }

  private view = (c: CampaignWithType) => toView(c, this.pricing);

  /** Runs every rule; the content type when they all pass. */
  private async checked(dto: CreateCampaignDto): Promise<ContentType> {
    const type = await this.prisma.contentType.findUnique({ where: { id: dto.contentTypeId } });
    const posts = type?.postsOnCreatorAccount ?? true;
    const problems = [
      ...contentTypeProblems(type, dto),
      ...goalProblems(dto.goals),
      ...paymentProblems(dto),
      ...timelineProblems(dto, posts),
    ];
    if (posts && !dto.keepLiveDays) problems.push('keepLiveDays is required when creators post');
    if (problems.length) throw new BadRequestException(problems);
    return type!;
  }

  async create(business: User, dto: CreateCampaignDto): Promise<CampaignView> {
    const type = await this.checked(dto);
    const created = await this.prisma.campaign.create({
      data: { businessId: business.id, ...toCampaignData(dto, type) },
      include: WITH_TYPE,
    });
    return this.view(created);
  }

  /** Replaces everything about a draft. Live campaigns can't be edited, because creators may have joined. */
  async update(business: User, id: string, dto: CreateCampaignDto): Promise<CampaignView> {
    await this.findOwnDraft(business, id, 'Only drafts can be edited.');
    const type = await this.checked(dto);
    // Only writes while it is still a draft, in case it was published meanwhile.
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, status: 'DRAFT' },
      data: toCampaignData(dto, type),
    });
    if (!count) throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_NOT_DRAFT', 'Only drafts can be edited.');
    return this.getMine(business, id);
  }

  /** The business's own campaigns, newest first. */
  async listMine(business: User, query: ListCampaignsQuery): Promise<Paginated<CampaignView>> {
    return this.list({ businessId: business.id, ...(query.status && { status: query.status }) }, query);
  }

  async getMine(business: User, id: string): Promise<CampaignView> {
    return this.view(await this.findOwn(business, id));
  }

  /** Draft to live. Creators can then see it and ask to join. */
  async publish(business: User, id: string): Promise<CampaignView> {
    const campaign = await this.findOwn(business, id);
    if (campaign.status !== 'DRAFT') {
      throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_NOT_DRAFT', 'Only drafts can be published.');
    }
    if (fromDay(campaign.applyBy) < todayInManila()) {
      throw apiError(
        HttpStatus.CONFLICT,
        'APPLY_DATE_PASSED',
        'Applications for this campaign have already closed. Create it again with new dates.',
      );
    }
    // Only flips a draft, so two taps on Publish can't both succeed.
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'LIVE', publishedAt: new Date() },
    });
    if (!count) throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_NOT_DRAFT', 'Only drafts can be published.');
    return this.getMine(business, id);
  }

  /** Drafts can be thrown away. Live campaigns can't, because creators may have joined. */
  async removeDraft(business: User, id: string): Promise<{ ok: true }> {
    const campaign = await this.findOwnDraft(business, id, 'Only drafts can be deleted.');
    await this.prisma.campaign.deleteMany({ where: { id, status: 'DRAFT' } });
    if (campaign.coverUrl) await this.storage.removeByUrl([campaign.coverUrl]);
    return { ok: true };
  }

  /** Saves a cover photo and drops the old one. */
  async setCover(business: User, id: string, file?: UploadedImage): Promise<CampaignView> {
    if (!file) throw new BadRequestException(['file is required']);
    const ext = COVER_TYPES[file.mimetype];
    if (!ext) throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', 'Use a JPEG, PNG or WebP photo.');
    const campaign = await this.findOwnDraft(business, id, 'Only drafts can be changed.');
    // A new name each time, so phones never show a cached old cover.
    const url = await this.storage.upload(`campaigns/${id}/cover-${Date.now()}.${ext}`, file.buffer, file.mimetype);
    await this.prisma.campaign.update({ where: { id }, data: { coverUrl: url } });
    if (campaign.coverUrl) await this.storage.removeByUrl([campaign.coverUrl]);
    return this.getMine(business, id);
  }

  /**
   * Uses a photo the business made with Enhance as the cover. Only files in
   * our storage under the business's own enhance folder are accepted.
   */
  async setCoverFromUrl(business: User, id: string, url: string): Promise<CampaignView> {
    const campaign = await this.findOwnDraft(business, id, 'Only drafts can be changed.');
    if (!this.storage.isOurs(url) || !url.includes(`/enhance/${business.id}/`)) {
      throw new BadRequestException(['url must be a photo you enhanced in Cebi']);
    }
    await this.prisma.campaign.update({ where: { id }, data: { coverUrl: url } });
    // Covers uploaded straight to the campaign are removed; enhanced ones stay with their originals.
    if (campaign.coverUrl?.includes(`/campaigns/${id}/`)) await this.storage.removeByUrl([campaign.coverUrl]);
    return this.getMine(business, id);
  }

  /** Removes the cover, so the content type's picture shows again. */
  async removeCover(business: User, id: string): Promise<CampaignView> {
    const campaign = await this.findOwnDraft(business, id, 'Only drafts can be changed.');
    if (campaign.coverUrl) {
      await this.prisma.campaign.update({ where: { id }, data: { coverUrl: null } });
      await this.storage.removeByUrl([campaign.coverUrl]);
    }
    return this.getMine(business, id);
  }

  /**
   * "Cebi estimate": how many creators near the business match, and the views
   * the campaign could reach (see campaign-estimate.ts for the assumptions).
   */
  async estimate(business: User, dto: EstimateCampaignDto) {
    const [profile, type] = await Promise.all([
      this.prisma.businessProfile.findUnique({ where: { userId: business.id } }),
      dto.contentTypeId ? this.prisma.contentType.findUnique({ where: { id: dto.contentTypeId } }) : null,
    ]);
    const city = profile?.city ?? null;
    const matchingCreators = await this.prisma.creatorProfile.count({
      where: {
        platforms: { hasSome: dto.platforms },
        ...(city && { city: { equals: city, mode: 'insensitive' } }),
        user: { role: 'CREATOR', status: 'ACTIVE', onboardedAt: { not: null } },
      },
    });
    return {
      views: estimateViews(dto, type?.postsOnCreatorAccount ?? true),
      matchingCreators,
      city,
      basis: 'Typical views for local creators on each platform',
    };
  }

  /** Admin: every campaign. */
  async listAll(query: ListCampaignsQuery): Promise<Paginated<CampaignView>> {
    return this.list(query.status ? { status: query.status } : {}, query);
  }

  async get(id: string): Promise<CampaignView> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id }, include: WITH_TYPE });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return this.view(campaign);
  }

  private async list(where: Prisma.CampaignWhereInput, query: ListCampaignsQuery) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: WITH_TYPE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return new Paginated(items.map(this.view), total, query.page, query.pageSize);
  }

  private async findOwnDraft(business: User, id: string, message: string): Promise<CampaignWithType> {
    const campaign = await this.findOwn(business, id);
    if (campaign.status !== 'DRAFT') throw apiError(HttpStatus.CONFLICT, 'CAMPAIGN_NOT_DRAFT', message);
    return campaign;
  }

  /** Someone else's campaign answers 404, the same as a missing one. */
  private async findOwn(business: User, id: string): Promise<CampaignWithType> {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, businessId: business.id }, include: WITH_TYPE });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
}
