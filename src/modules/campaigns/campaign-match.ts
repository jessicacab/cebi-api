import type { SocialPlatform } from '../../generated/prisma/enums.js';

/** Creator interests that fit each business category (ids from the onboarding options). */
export const CATEGORY_NICHES: Record<string, string[]> = {
  restaurant: ['food'],
  cafe: ['food', 'lifestyle'],
  resort: ['travel', 'lifestyle', 'family'],
  beauty_spa: ['beauty', 'lifestyle'],
  retail: ['fashion', 'lifestyle', 'tech'],
  fitness: ['fitness', 'lifestyle'],
};

const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
};

const NICHE_NAMES: Record<string, string> = {
  food: 'food',
  travel: 'travel',
  beauty: 'beauty',
  lifestyle: 'lifestyle',
  fitness: 'fitness',
  tech: 'tech',
  fashion: 'fashion',
  family: 'family',
};

export interface MatchInput {
  campaignPlatforms: SocialPlatform[];
  businessCity: string | null;
  businessCategory: string | null;
  creatorPlatforms: SocialPlatform[];
  creatorCity: string | null;
  creatorNiches: string[];
}

/**
 * How well a campaign fits a creator, 0 to 99, with the reasons in plain
 * words. A simple, explainable rule (not AI): same city, interests that fit
 * the business, and shared platforms. Null when the creator can't join
 * because they aren't on any of the campaign's platforms.
 */
export const matchFit = (m: MatchInput): { score: number; reasons: string[] } | null => {
  const shared = m.campaignPlatforms.filter((p) => m.creatorPlatforms.includes(p));
  if (!shared.length) return null;
  let score = 40;
  const reasons: string[] = [];

  const sameCity = !!m.businessCity && !!m.creatorCity && m.businessCity.toLowerCase() === m.creatorCity.toLowerCase();
  if (sameCity) {
    score += 25;
    reasons.push(`In ${m.businessCity}`);
  }
  const niche = (CATEGORY_NICHES[m.businessCategory ?? ''] ?? []).find((n) => m.creatorNiches.includes(n));
  if (niche) {
    score += 25;
    reasons.push(`Fits your ${NICHE_NAMES[niche] ?? niche} content`);
  }
  score += Math.min(shared.length, 2) * 5;
  reasons.push(`You post on ${shared.map((p) => PLATFORM_NAMES[p]).join(' and ')}`);
  return { score: Math.min(score, 99), reasons };
};
