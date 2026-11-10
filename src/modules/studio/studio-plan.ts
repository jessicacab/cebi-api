import { z } from 'zod';

export const TONES = ['Natural', 'Shorter', 'Funnier', 'Bisaya'] as const;
export type Tone = (typeof TONES)[number];

/** Everything the AI may use to plan one piece: campaign facts and the creator's interests only. */
export interface PlanContext {
  business: string;
  businessCategory: string | null;
  city: string | null;
  campaignTitle: string;
  contentType: string;
  piece: string;
  platform: string | null;
  postsPublicly: boolean;
  talkingPoints: string[];
  avoid: string[];
  creatorInterests: string[];
  tone: Tone;
}

const TONE_NOTES: Record<Tone, string> = {
  Natural: 'Natural and friendly, like talking to followers.',
  Shorter: 'As short and punchy as possible.',
  Funnier: 'Playful and funny, but still clear about the business.',
  Bisaya: 'Mostly in Bisaya (Cebuano) with a little English, natural for Cebu followers.',
};

export const PLAN_SYSTEM = [
  'You are a content coach for local creators in Cebu, Philippines, making sponsored posts for small businesses.',
  'Plan real content the creator will film or photograph themselves.',
  'Use only the facts given. Never invent prices, discounts, dates, menu items or claims.',
  'Say every talking point; never include anything from the avoid list.',
  'No emojis in the script or shots. Do not use em dashes or en dashes.',
].join(' ');

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    hooks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { style: { type: 'string' }, text: { type: 'string' } },
        required: ['style', 'text'],
        additionalProperties: false,
      },
    },
    shots: {
      type: 'array',
      items: {
        type: 'object',
        properties: { time: { type: 'string' }, text: { type: 'string' } },
        required: ['time', 'text'],
        additionalProperties: false,
      },
    },
    script: { type: 'string' },
    caption: { type: 'string' },
  },
  required: ['hooks', 'shots', 'script', 'caption'],
  additionalProperties: false,
};

export const planPrompt = (c: PlanContext) =>
  [
    `Business: ${c.business}${c.businessCategory ? ` (${c.businessCategory})` : ''}${c.city ? ` in ${c.city}` : ''}.`,
    `Campaign: ${c.campaignTitle} (${c.contentType}).`,
    `This piece: ${c.piece}${c.platform ? ` for ${c.platform}` : ''}${c.postsPublicly ? '' : '. The business posts it themselves, so no "follow me" lines'}.`,
    c.talkingPoints.length && `Talking points: ${c.talkingPoints.join('; ')}.`,
    c.avoid.length && `Avoid: ${c.avoid.join('; ')}.`,
    c.creatorInterests.length && `Creator's interests: ${c.creatorInterests.join(', ')}.`,
    `Tone: ${TONE_NOTES[c.tone]}`,
    'Give 3 hooks (each with a short style name like POV or Taste test), 4 to 6 shots with times for a video or angles for photos, a short script (or photo notes for photos), and one caption without hashtags.',
  ]
    .filter(Boolean)
    .join('\n');

const planAnswer = z.object({
  hooks: z.array(z.object({ style: z.string(), text: z.string() })),
  shots: z.array(z.object({ time: z.string(), text: z.string() })),
  script: z.string(),
  caption: z.string(),
});

/** Long dashes out, spaces tidied. */
export const tidy = (s: string) => s.replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/[ \t]+/g, ' ').trim();

/** The model's plan, checked and tidied; null when it doesn't fit. */
export const cleanPlan = (raw: unknown) => {
  const parsed = planAnswer.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    hooks: p.hooks.slice(0, 3).map((h) => ({ style: tidy(h.style).slice(0, 30), text: tidy(h.text).slice(0, 140) })),
    shots: p.shots.slice(0, 6).map((s) => ({ time: tidy(s.time).slice(0, 20), text: tidy(s.text).slice(0, 140) })),
    script: p.script.replace(/\s*[\u2013\u2014]\s*/g, ', ').trim().slice(0, 1500),
    caption: tidy(p.caption).slice(0, 1500),
  };
};

export interface CaptionRules {
  hashtags: string[];
  mentions: string[];
  link: string | null;
}

/**
 * Adds what the campaign requires to a caption, so the AI can't forget it:
 * every hashtag, every mention and the link or code, once each.
 */
export const withRequired = (caption: string, rules: CaptionRules) => {
  const lower = caption.toLowerCase();
  const missing = [...rules.mentions, ...rules.hashtags].filter((t) => !lower.includes(t.toLowerCase()));
  const link = rules.link && !lower.includes(rules.link.toLowerCase()) ? rules.link : null;
  return [caption.trim(), link, missing.join(' ')].filter(Boolean).join('\n\n');
};

/** What's still missing from a caption, for the checklist. */
export const captionChecks = (caption: string, rules: CaptionRules) => {
  const lower = caption.toLowerCase();
  return [
    ...rules.hashtags.map((h) => ({ label: h, ok: lower.includes(h.toLowerCase()) })),
    ...rules.mentions.map((m) => ({ label: `Mention ${m}`, ok: lower.includes(m.toLowerCase()) })),
    ...(rules.link ? [{ label: `Link or code: ${rules.link}`, ok: lower.includes(rules.link.toLowerCase()) }] : []),
  ];
};
