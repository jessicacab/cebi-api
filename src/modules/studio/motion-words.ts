/**
 * The words a moving ad starts with, all from the campaign: never written by
 * AI and never a claim the brief doesn't make (cebi-studio skill, "Words come
 * from the campaign"). Pure, so it is easy to test.
 */

/** Title words that say nothing to a viewer. */
const GENERIC = new Set(['product', 'products', 'launch', 'campaign', 'promo', 'promotion', 'collab', 'the', 'a', 'an', 'of', 'for', 'and', 'with', 'our', 'to', 'in', 'at']);

export const MOTION_WORD_MAX = 20;
export const MOTION_WORDS_MAX = 4;

/** Up to 3 short words from the campaign title ("New Cookie Flavor Product" gives New, Cookie, Flavor). */
export const titleWords = (title: string): string[] =>
  title
    .split(/[\s/|,.:;!?()-]+/)
    .map((w) => w.trim())
    .filter((w) => w && !GENERIC.has(w.toLowerCase()) && w.length <= 14)
    .slice(0, 3);

/** End card choices from the brief: the promo code or short link, then the hashtags. */
export const ctaOptions = (campaign: { link: string | null; hashtags: string[] }): string[] => {
  const options = [campaign.link?.trim(), ...campaign.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`))]
    .filter((x): x is string => !!x && x.length <= 30);
  return [...new Set(options)];
};

/** The business's handle for the end card: Instagram first, then TikTok. */
export const handleFrom = (socials: unknown): string | null => {
  const s = (socials && typeof socials === 'object' ? socials : {}) as Record<string, string | undefined>;
  return s.instagram ?? s.tiktok ?? null;
};

export interface MotionCampaign {
  title: string;
  link: string | null;
  hashtags: string[];
  business: { name: string | null; businessProfile: { socials: unknown } | null };
}

/** What the app shows before making a moving ad: suggested words, CTA choices and the handle. */
export const motionDefaults = (campaign: MotionCampaign) => {
  const ctas = ctaOptions(campaign);
  return {
    words: titleWords(campaign.title),
    ctaOptions: ctas,
    cta: ctas[0] ?? null,
    handle: handleFrom(campaign.business.businessProfile?.socials),
    businessName: campaign.business.name ?? 'Our shop',
  };
};
