import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { apiError } from '../../common/errors.js';
import type { User } from '../../generated/prisma/client.js';
import { AiClient } from '../../integrations/openai/ai-client.js';
import { AiUsage } from '../../integrations/openai/ai-usage.js';
import { FileStorage } from '../../integrations/supabase/file-storage.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BUSINESS_CATEGORIES } from '../onboarding/onboarding.options.js';
import { CLIP_MOTIONS } from './animate.js';
import { ENHANCE_STYLES, enhancePrompt, levelFor, sizeFor, stylesFor, type EnhanceLevel } from './enhance.js';
import type { CaptionDto, CheckCaptionDto, EnhanceDto, PlanDto } from './dto/studio.dto.js';
import { MOTION_SET } from '../../integrations/media/motion/templates/index.js';
import { motionDefaults } from './motion-words.js';
import { findMyPiece, type Piece } from './studio-pieces.js';
import { captionChecks, cleanPlan, PLAN_SCHEMA, PLAN_SYSTEM, planPrompt, tidy, withRequired, type CaptionRules } from './studio-plan.js';

/** A file from a multipart upload (multer). */
export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PLATFORM_NAMES: Record<string, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', YOUTUBE: 'YouTube', FACEBOOK: 'Facebook' };

const pieceLabel = (p: Piece) => {
  const what = p.format === 'VIDEO' ? 'video' : 'photo';
  const length =
    p.format === 'VIDEO' && p.minSeconds && p.maxSeconds ? ` of ${p.minSeconds} to ${p.maxSeconds} seconds` : '';
  return `${what} ${p.number}${length}`;
};

const rulesOf = (p: Piece): CaptionRules => ({
  hashtags: p.campaign.hashtags,
  mentions: p.campaign.mentions,
  link: p.campaign.link,
});

/**
 * Cebi Studio: AI help for real content. Plans and captions for a creator's
 * piece, and Enhance for photos (creators' pieces and businesses' covers).
 * Rules and limits are in the cebi-studio skill.
 */
@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly usage: AiUsage,
    private readonly storage: FileStorage,
  ) {}

  private myPiece(creator: User, pieceId: string): Promise<Piece> {
    return findMyPiece(this.prisma, creator, pieceId);
  }

  private requireAi() {
    if (!this.ai.enabled) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI features are not set up yet.');
    }
  }

  /**
   * How far Enhance may go. Businesses polish their own product, so always
   * full. Creators: full for ad-style campaigns, light fixes otherwise.
   */
  private async levelFor(user: User, pieceId?: string): Promise<EnhanceLevel> {
    if (user.role === 'BUSINESS') return 'full';
    if (!pieceId) throw new BadRequestException(['pieceId is required']);
    const piece = await this.myPiece(user, pieceId);
    return levelFor(piece.campaign.contentType.slug);
  }

  async enhanceStyles(user: User, pieceId?: string) {
    const level = await this.levelFor(user, pieceId);
    const piece = user.role === 'CREATOR' && pieceId ? await this.myPiece(user, pieceId) : null;
    return {
      // Moving ads (motion templates, no AI generation) are allowed on every campaign type.
      motion: piece
        ? { allowed: true, ...motionDefaults(piece.campaign), variants: MOTION_SET.map(({ key, name, description }) => ({ key, name, description })) }
        : { allowed: false },
      level,
      enabled: this.ai.enabled,
      styles: stylesFor(level).map(({ id, name, description }) => ({ id, name, description })),
      // "Animate a photo" follows the same rule as full Enhance, and is for creators' pieces.
      animate: {
        allowed: this.ai.enabled && level === 'full' && user.role === 'CREATOR',
        motions: CLIP_MOTIONS.map(({ id, name, description }) => ({ id, name, description })),
      },
    };
  }

  /** Two AI versions of a real photo, plus the original, saved in storage. */
  async enhance(user: User, dto: EnhanceDto, file?: UploadedPhoto) {
    this.requireAi();
    if (!file) throw new BadRequestException(['file is required']);
    const ext = PHOTO_TYPES[file.mimetype];
    if (!ext) throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', 'Use a JPEG, PNG or WebP photo.');
    const level = await this.levelFor(user, dto.pieceId);
    const style = ENHANCE_STYLES.find((s) => s.id === dto.style)!;
    if (!stylesFor(level).some((s) => s.id === style.id)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'STYLE_NOT_ALLOWED', 'This campaign only allows light fixes, so the product looks the way it really is.');
    }
    this.usage.take(user.id, 'image');

    const stamp = Date.now();
    const folder = `enhance/${user.id}`;
    const originalUrl = await this.storage.upload(`${folder}/${stamp}-original.${ext}`, file.buffer, file.mimetype);
    const images = await this.ai.editImage({
      image: file.buffer,
      mimeType: file.mimetype,
      prompt: enhancePrompt(style),
      n: 2,
      size: sizeFor(dto.purpose ?? 'post'),
      userId: user.id,
    });
    const urls = await Promise.all(images.map((img, i) => this.storage.upload(`${folder}/${stamp}-${style.id}-${i + 1}.jpg`, img, 'image/jpeg')));
    return { level, style: style.id, label: 'AI-enhanced', originalUrl, images: urls };
  }

  /** Saves a creator's own photo for a piece (no AI), so it can be sent as is. */
  async uploadPhoto(creator: User, pieceId: string, file?: UploadedPhoto) {
    if (!file) throw new BadRequestException(['file is required']);
    const ext = PHOTO_TYPES[file.mimetype];
    if (!ext) throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', 'Use a JPEG, PNG or WebP photo.');
    await this.myPiece(creator, pieceId);
    const url = await this.storage.upload(`pieces/${pieceId}/${Date.now()}.${ext}`, file.buffer, file.mimetype);
    return { url };
  }

  /** Hooks, shots, script and a caption for one piece, from the real campaign. */
  async plan(creator: User, dto: PlanDto) {
    this.requireAi();
    const piece = await this.myPiece(creator, dto.pieceId);
    this.usage.take(creator.id);
    const c = piece.campaign;
    const raw = await this.ai.json({
      name: 'studio_plan',
      system: PLAN_SYSTEM,
      user: planPrompt({
        business: c.business.name ?? 'a local business',
        businessCategory: BUSINESS_CATEGORIES.find((x) => x.id === c.business.businessProfile?.category)?.name ?? null,
        city: c.business.businessProfile?.city ?? null,
        campaignTitle: c.title,
        contentType: c.contentType.name,
        piece: pieceLabel(piece),
        platform: piece.platform ? PLATFORM_NAMES[piece.platform] : null,
        postsPublicly: c.contentType.postsOnCreatorAccount,
        talkingPoints: c.talkingPoints,
        avoid: c.avoid,
        creatorInterests: piece.application.creator.creatorProfile?.niches ?? [],
        tone: dto.tone ?? 'Natural',
      }),
      schema: PLAN_SCHEMA,
      maxOutputTokens: 1500,
    });
    const plan = cleanPlan(raw);
    if (!plan) throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't plan this right now. Try again.");
    const caption = withRequired(plan.caption, rulesOf(piece));
    return { ...plan, caption, checks: captionChecks(caption, rulesOf(piece)), tagBusiness: c.tagBusiness ? (c.business.name ?? null) : null };
  }

  /** A new caption (or a rewrite of the current one), with the campaign's must-haves added. */
  async caption(creator: User, dto: CaptionDto) {
    this.requireAi();
    const piece = await this.myPiece(creator, dto.pieceId);
    this.usage.take(creator.id);
    const c = piece.campaign;
    const raw = await this.ai.json({
      name: 'caption',
      system: PLAN_SYSTEM,
      user: [
        `Write one ${dto.tone ?? 'Natural'} caption for a ${pieceLabel(piece)} for ${c.business.name ?? 'a local business'}'s "${c.title}".`,
        c.talkingPoints.length && `Mention: ${c.talkingPoints.join('; ')}.`,
        c.avoid.length && `Avoid: ${c.avoid.join('; ')}.`,
        dto.current && `Rewrite this one, keeping its meaning: ${dto.current}`,
        'No hashtags; they are added for you.',
      ]
        .filter(Boolean)
        .join('\n'),
      schema: { type: 'object', properties: { caption: { type: 'string' } }, required: ['caption'], additionalProperties: false },
      maxOutputTokens: 500,
    });
    const parsed = z.object({ caption: z.string() }).safeParse(raw);
    if (!parsed.success || !parsed.data.caption.trim()) {
      throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't write a caption right now. Try again.");
    }
    const caption = withRequired(tidy(parsed.data.caption).slice(0, 1500), rulesOf(piece));
    return { caption, checks: captionChecks(caption, rulesOf(piece)) };
  }

  /** What a caption is still missing (no AI): hashtags, mentions, the link or code. */
  async checkCaption(creator: User, dto: CheckCaptionDto) {
    const piece = await this.myPiece(creator, dto.pieceId);
    return { checks: captionChecks(dto.caption, rulesOf(piece)) };
  }
}
