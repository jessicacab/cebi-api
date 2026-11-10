import type { SocialPlatform } from '../../generated/prisma/enums.js';
import type { DeliverableDto } from '../content-types/dto/content-type.dto.js';

/**
 * Starting assumptions: views one post usually gets from a local micro
 * creator (about 5k to 50k followers) on each platform. They are a rough
 * guide until creators connect their accounts; then the estimate should use
 * each matching creator's real average views instead (see the cebi-campaigns
 * skill). Tune them here, in one place.
 */
export const VIEWS_PER_POST: Record<SocialPlatform, { low: number; high: number }> = {
  TIKTOK: { low: 1500, high: 6000 },
  INSTAGRAM: { low: 800, high: 3000 },
  YOUTUBE: { low: 500, high: 2500 },
  FACEBOOK: { low: 400, high: 2000 },
};

/** A photo post usually gets about half the views of a video. */
export const PHOTO_FACTOR = 0.5;

const roundTo100 = (n: number) => Math.round(n / 100) * 100;

/**
 * Views the whole campaign could reach: every creator posts every deliverable
 * on every platform. Null when creators don't post (UGC), so there is nothing
 * public to count.
 */
export const estimateViews = (
  input: { platforms: SocialPlatform[]; deliverables: DeliverableDto[]; slots: number },
  postsPublicly: boolean,
): { low: number; high: number } | null => {
  if (!postsPublicly) return null;
  const weightedPosts = input.deliverables.reduce((sum, d) => sum + d.count * (d.format === 'PHOTO' ? PHOTO_FACTOR : 1), 0);
  const perCreator = input.platforms.reduce(
    (sum, p) => ({ low: sum.low + VIEWS_PER_POST[p].low * weightedPosts, high: sum.high + VIEWS_PER_POST[p].high * weightedPosts }),
    { low: 0, high: 0 },
  );
  return { low: roundTo100(perCreator.low * input.slots), high: roundTo100(perCreator.high * input.slots) };
};
