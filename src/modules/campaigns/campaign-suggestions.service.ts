import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../../common/errors.js';
import type { User } from '../../generated/prisma/client.js';
import { AiClient } from '../../integrations/openai/ai-client.js';
import { AiUsage } from '../../integrations/openai/ai-usage.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BUSINESS_CATEGORIES } from '../onboarding/onboarding.options.js';
import { cleanSuggestions, SUGGEST_SCHEMA, SUGGEST_SYSTEM, suggestPrompt } from './campaign-suggestions.js';
import type { SuggestDto } from './dto/suggest.dto.js';

const PLATFORM_NAMES: Record<string, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', YOUTUBE: 'YouTube', FACEBOOK: 'Facebook' };

/** AI ideas while a business creates a campaign: talking points, things to avoid, hashtags, names. */
@Injectable()
export class CampaignSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly usage: AiUsage,
  ) {}

  async suggest(business: User, dto: SuggestDto) {
    if (!this.ai.enabled) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI suggestions are not set up yet.');
    }
    this.usage.take(business.id);
    const [profile, type] = await Promise.all([
      this.prisma.businessProfile.findUnique({ where: { userId: business.id } }),
      dto.contentTypeId ? this.prisma.contentType.findUnique({ where: { id: dto.contentTypeId } }) : null,
    ]);
    const existing = dto.existing ?? [];
    const raw = await this.ai.json({
      name: 'suggestions',
      system: SUGGEST_SYSTEM,
      user: suggestPrompt({
        field: dto.field,
        businessName: business.name,
        businessCategory: BUSINESS_CATEGORIES.find((c) => c.id === profile?.category)?.name ?? null,
        city: profile?.city ?? null,
        contentType: type?.name ?? null,
        platforms: (dto.platforms ?? []).map((p) => PLATFORM_NAMES[p] ?? p),
        brief: dto.brief,
        title: dto.title,
        existing,
      }),
      schema: SUGGEST_SCHEMA,
      maxOutputTokens: 500,
    });
    const suggestions = cleanSuggestions(raw, dto.field, existing);
    if (!suggestions.length) throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI didn't have good ideas this time. Try again.");
    return { suggestions };
  }
}
