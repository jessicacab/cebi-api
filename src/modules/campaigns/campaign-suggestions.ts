import { z } from 'zod';

export const SUGGEST_FIELDS = ['talkingPoints', 'avoid', 'hashtags', 'title'] as const;
export type SuggestField = (typeof SUGGEST_FIELDS)[number];

export interface SuggestContext {
  field: SuggestField;
  businessName: string | null;
  businessCategory: string | null;
  city: string | null;
  contentType: string | null;
  platforms: string[];
  brief?: string;
  title?: string;
  existing: string[];
}

const TASKS: Record<SuggestField, string> = {
  talkingPoints: 'Suggest 5 short talking points (under 100 characters each) that creators should mention in their content.',
  avoid: 'Suggest 5 short things creators should avoid (under 100 characters each), for example showing competitors or wrong claims.',
  hashtags: 'Suggest 6 hashtags: a mix of ones specific to this business or campaign and popular local ones. Letters and numbers only.',
  title: 'Suggest 4 short, catchy campaign names (under 40 characters each).',
};

const LIMITS: Record<SuggestField, number> = { talkingPoints: 120, avoid: 120, hashtags: 50, title: 80 };

/** JSON Schema of the answer (OpenAI strict mode). */
export const SUGGEST_SCHEMA = {
  type: 'object',
  properties: { suggestions: { type: 'array', items: { type: 'string' } } },
  required: ['suggestions'],
  additionalProperties: false,
};

export const SUGGEST_SYSTEM = [
  'You help small local businesses in Cebu, Philippines, write influencer campaigns for local content creators.',
  'Write clear, friendly English that local creators understand, specific to this business and what it promotes.',
  'Use only the facts given. Never invent prices, discounts, dates, awards or health claims.',
  'No emojis. Do not use em dashes or en dashes.',
].join(' ');

/** The task and the business's details, as the prompt. */
export const suggestPrompt = (c: SuggestContext) =>
  [
    `Business: ${c.businessName ?? 'a local business'}${c.businessCategory ? ` (${c.businessCategory})` : ''}${c.city ? ` in ${c.city}` : ''}.`,
    c.contentType && `Campaign type: ${c.contentType}.`,
    c.platforms.length && `Platforms: ${c.platforms.join(', ')}.`,
    c.title && `Campaign name: ${c.title}.`,
    c.brief && `What they are promoting: ${c.brief}.`,
    c.existing.length && `They already have: ${c.existing.join('; ')}. Do not repeat these.`,
    TASKS[c.field],
  ]
    .filter(Boolean)
    .join('\n');

const answer = z.object({ suggestions: z.array(z.string()) });

/** "#Ube Cheesecake!" → "#UbeCheesecake". */
const toHashtag = (s: string) => {
  const body = s.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return body ? `#${body}` : '';
};

/**
 * The model's answer, cleaned: right shape, trimmed, no long dashes, hashtags
 * written as hashtags, nothing the business already has, at most 6.
 */
export const cleanSuggestions = (raw: unknown, field: SuggestField, existing: string[]): string[] => {
  const parsed = answer.safeParse(raw);
  if (!parsed.success) return [];
  const known = new Set(existing.map((e) => e.toLowerCase()));
  const out: string[] = [];
  for (const item of parsed.data.suggestions) {
    let text = item.replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/\s+/g, ' ').trim();
    if (field === 'hashtags') text = toHashtag(text);
    if (!text || text.length > LIMITS[field] || known.has(text.toLowerCase())) continue;
    known.add(text.toLowerCase());
    out.push(text);
  }
  return out.slice(0, 6);
};
