import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { AiClient } from '../../integrations/openai/ai-client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BUSINESS_CATEGORIES } from '../onboarding/onboarding.options.js';
import { cleanMatches, MATCH_SCHEMA, MATCH_SYSTEM, MatchCache, matchPrompt, type MatchCandidate } from './campaign-ai-match.js';
import { matchFit } from './campaign-match.js';
import { fromDay, toDay, todayInManila } from './campaign-rules.js';
import { CARD, toCard, type CardCampaign } from './creator-card.js';
import type { DiscoverQuery } from './dto/creator-campaign.dto.js';

type Profile = Pick<Prisma.CreatorProfileGetPayload<object>, 'platforms' | 'city' | 'niches'> | null;

/** "2026-11" for a moment, in Manila. */
const monthOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(d);

const fitFor = (c: CardCampaign, profile: Profile) =>
  profile
    ? matchFit({
        campaignPlatforms: c.platforms,
        businessCity: c.business.businessProfile?.city ?? null,
        businessCategory: c.business.businessProfile?.category ?? null,
        creatorPlatforms: profile.platforms,
        creatorCity: profile.city,
        creatorNiches: profile.niches,
      })
    : null;

const PLATFORM_NAMES: Record<string, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', YOUTUBE: 'YouTube', FACEBOOK: 'Facebook' };

/** Facts about a campaign for the AI ranking: no names of people, no contact details. */
const toCandidate = (c: CardCampaign, card: ReturnType<typeof toCard>): MatchCandidate => ({
  id: c.id,
  title: c.title,
  type: c.contentType.name,
  businessCategory: BUSINESS_CATEGORIES.find((x) => x.id === c.business.businessProfile?.category)?.name ?? null,
  businessCity: c.business.businessProfile?.city ?? null,
  platforms: c.platforms.map((p) => PLATFORM_NAMES[p] ?? p),
  content: (card.deliverables as { format: string; count: number }[]).map((d) => `${d.count} ${d.format.toLowerCase()}`).join(' + '),
  reward: [
    c.cashPerCreator !== null && `P${c.cashPerCreator} cash`,
    c.product && `free ${c.product}`,
    c.commissionPct !== null && `${c.commissionPct}% commission`,
  ]
    .filter(Boolean)
    .join(' + '),
  talkingPoints: c.talkingPoints.slice(0, 3),
});

/** Creators finding live campaigns and reading one before asking to join. */
@Injectable()
export class CreatorCampaignsService {
  private readonly logger = new Logger('ForYou');
  private readonly matchCache = new MatchCache();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  /** Live, open campaigns the creator can still join, newest first (used by the tab and Quick match). */
  private async openFor(creator: User, profile: Profile, query: DiscoverQuery = {}): Promise<CardCampaign[]> {
    const today = todayInManila();
    const q = query.q?.trim();
    const rows = await this.prisma.campaign.findMany({
      where: {
        status: 'LIVE',
        applyBy: { gte: toDay(today) },
        platforms: { hasSome: profile?.platforms ?? [] },
        applications: { none: { creatorId: creator.id } },
        ...(query.category && { business: { businessProfile: { category: query.category } } }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { business: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }),
      },
      include: CARD,
      orderBy: { publishedAt: 'desc' },
      take: 60,
    });
    return rows.filter((c) => c._count.applications < c.slots);
  }

  /** The simple fit rule's ranking (also the fallback when AI is off or fails). */
  private ruleRanked(open: CardCampaign[], profile: Profile, today: string) {
    return open
      .map((c) => ({ c, fit: fitFor(c, profile) }))
      .filter((x): x is { c: CardCampaign; fit: { score: number; reasons: string[] } } => !!x.fit)
      .sort((a, b) => b.fit.score - a.fit.score)
      .map(({ c, fit }) => ({ campaign: toCard(c, today), score: fit.score, reasons: fit.reasons, raw: c }));
  }

  /**
   * The creator's Campaigns tab: their numbers, and live campaigns they can
   * still join (open, not full, on one of their platforms, not requested yet).
   */
  async discover(creator: User, query: DiscoverQuery) {
    const today = todayInManila();
    const profile = await this.prisma.creatorProfile.findUnique({ where: { userId: creator.id } });
    const open = await this.openFor(creator, profile, query);
    const cards = open.map((c) => toCard(c, today));
    const city = profile?.city?.toLowerCase();
    const forYou = this.ruleRanked(open, profile, today)
      .slice(0, 10)
      .map(({ raw: _raw, ...pick }) => pick);

    return {
      stats: await this.stats(creator),
      city: profile?.city ?? null,
      categories: BUSINESS_CATEGORIES,
      featured: cards.slice(0, 10),
      endingSoon: cards.filter((c) => c.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
      nearYou: city ? cards.filter((c) => c.business.city?.toLowerCase() === city).slice(0, 10) : [],
      forYou,
    };
  }

  /**
   * Quick match: the top campaigns by the fit rule, ranked again by AI with a
   * personal reason each (cached for the day). Falls back to the rule, with
   * source "RULE", when AI is off or fails, so the app only says "AI" when it was.
   */
  async forYou(creator: User) {
    const today = todayInManila();
    const profile = await this.prisma.creatorProfile.findUnique({ where: { userId: creator.id } });
    const ranked = this.ruleRanked(await this.openFor(creator, profile), profile, today).slice(0, 15);
    const strip = ({ raw: _raw, ...pick }: (typeof ranked)[number]) => pick;
    const byRule = { source: 'RULE' as const, picks: ranked.slice(0, 10).map((r) => ({ ...strip(r), aiReason: null })) };
    if (!this.ai.enabled || !ranked.length || !profile) return byRule;

    const ids = ranked.map((r) => r.campaign.id);
    if (this.matchCache.stale(creator.id, today, ids)) {
      try {
        const raw = await this.ai.json({
          name: 'campaign_matches',
          system: MATCH_SYSTEM,
          user: matchPrompt(
            { interests: profile.niches, city: profile.city, platforms: profile.platforms.map((p) => PLATFORM_NAMES[p] ?? p) },
            ranked.map((r) => toCandidate(r.raw, r.campaign)),
          ),
          schema: MATCH_SCHEMA,
          maxOutputTokens: 1200,
        });
        const scores = cleanMatches(raw, ids);
        if (scores.size) this.matchCache.set(creator.id, today, scores);
      } catch (error) {
        this.logger.warn(`AI ranking failed, using the fit rule: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const cached = this.matchCache.get(creator.id, today);
    if (!cached) return byRule;
    const picks = ranked
      .map((r) => {
        const ai = cached.scores.get(r.campaign.id);
        return { ...strip(r), score: ai?.score ?? r.score, aiReason: ai?.reason ?? null };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    return { source: 'AI' as const, picks };
  }

  /** One campaign for a creator: live ones, or any they already asked to join. */
  async get(creator: User, id: string) {
    const today = todayInManila();
    const [campaign, profile] = await Promise.all([
      this.prisma.campaign.findUnique({
        where: { id },
        include: {
          ...CARD,
          applications: { where: { creatorId: creator.id }, select: { id: true, status: true, visitTime: true, createdAt: true } },
        },
      }),
      this.prisma.creatorProfile.findUnique({ where: { userId: creator.id } }),
    ]);
    const mine = campaign?.applications[0] ?? null;
    if (!campaign || (campaign.status !== 'LIVE' && !mine)) throw new NotFoundException('Campaign not found');

    const card = toCard(campaign, today);
    const fit = fitFor(campaign, profile);
    const cantApply = mine
      ? 'APPLIED'
      : campaign.status !== 'LIVE'
        ? 'NOT_LIVE'
        : card.applyBy < today
          ? 'APPLICATIONS_CLOSED'
          : card.slotsLeft <= 0
            ? 'CAMPAIGN_FULL'
            : !fit
              ? 'NOT_ON_PLATFORM'
              : null;

    return {
      ...card,
      status: campaign.status,
      contentDue: fromDay(campaign.contentDue),
      publishStart: campaign.publishStart && fromDay(campaign.publishStart),
      publishEnd: campaign.publishEnd && fromDay(campaign.publishEnd),
      goals: campaign.goals,
      hashtags: campaign.hashtags,
      tagBusiness: campaign.tagBusiness,
      mentions: campaign.mentions,
      talkingPoints: campaign.talkingPoints,
      avoid: campaign.avoid,
      link: campaign.link,
      showLocation: campaign.showLocation,
      reviewDrafts: campaign.reviewDrafts,
      revisions: campaign.revisions,
      keepLiveDays: campaign.keepLiveDays,
      adUsageDays: campaign.adUsageDays,
      spreadEvenly: campaign.spreadEvenly,
      visitTimes: campaign.visitTimes,
      fit,
      myApplication: mine,
      cantApply,
    };
  }

  /** Earned this and last month (cash marked paid), what's ongoing and pending, and requests waiting. */
  private async stats(creator: User) {
    const apps = await this.prisma.campaignApplication.findMany({
      where: { creatorId: creator.id },
      select: { status: true, paidAt: true, campaign: { select: { cashPerCreator: true } } },
    });
    const now = new Date();
    const thisMonth = monthOf(now);
    const lastMonth = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 15));
    const cash = (a: (typeof apps)[number]) => a.campaign.cashPerCreator ?? 0;
    const earned = (month: string) => apps.filter((a) => a.paidAt && monthOf(a.paidAt) === month).reduce((s, a) => s + cash(a), 0);
    const ongoing = apps.filter((a) => a.status === 'APPROVED' && !a.paidAt);
    return {
      earnedThisMonth: earned(thisMonth),
      earnedLastMonth: earned(lastMonth),
      ongoing: ongoing.length,
      pendingAmount: ongoing.reduce((s, a) => s + cash(a), 0),
      applied: apps.filter((a) => a.status === 'PENDING').length,
    };
  }
}
