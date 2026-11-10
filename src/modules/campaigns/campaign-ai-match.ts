import { z } from 'zod';

/** What the model sees about one campaign (facts only, no personal data). */
export interface MatchCandidate {
  id: string;
  title: string;
  type: string;
  businessCategory: string | null;
  businessCity: string | null;
  platforms: string[];
  content: string;
  reward: string;
  talkingPoints: string[];
}

export interface CreatorFacts {
  interests: string[];
  city: string | null;
  platforms: string[];
}

export const MATCH_SYSTEM = [
  'You match local content creators in the Philippines with brand campaigns.',
  "Score from 0 to 100 how well each campaign fits this creator: their interests, city, platforms, and what the campaign asks for.",
  'Write one short reason for each (under 90 characters) speaking to the creator, like "Your food videos fit this cafe launch."',
  'Use only the facts given. Never invent follower numbers, past results or details. No emojis. Do not use em dashes or en dashes.',
].join(' ');

export const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, score: { type: 'integer' }, reason: { type: 'string' } },
        required: ['id', 'score', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
};

export const matchPrompt = (creator: CreatorFacts, candidates: MatchCandidate[]) =>
  [
    `Creator: interests ${creator.interests.join(', ') || 'not set'}; city ${creator.city ?? 'not set'}; posts on ${creator.platforms.join(', ')}.`,
    'Campaigns (JSON):',
    JSON.stringify(candidates),
    'Score every campaign once, using its id.',
  ].join('\n');

const answer = z.object({ picks: z.array(z.object({ id: z.string(), score: z.number(), reason: z.string() })) });

/** The model's picks for known campaigns only, scores kept in 0 to 99, reasons trimmed and without long dashes. */
export const cleanMatches = (raw: unknown, ids: string[]): Map<string, { score: number; reason: string }> => {
  const out = new Map<string, { score: number; reason: string }>();
  const parsed = answer.safeParse(raw);
  if (!parsed.success) return out;
  for (const p of parsed.data.picks) {
    if (!ids.includes(p.id) || out.has(p.id)) continue;
    const reason = p.reason.replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 120);
    out.set(p.id, { score: Math.max(0, Math.min(99, Math.round(p.score))), reason });
  }
  return out;
};

/**
 * AI scores per creator, kept for the day so Quick match costs about one AI
 * call per creator per day. Asks again for new campaigns at most every 30
 * minutes. In memory (one API machine); move to Redis with several.
 */
export class MatchCache {
  private readonly entries = new Map<string, { day: string; at: number; scores: Map<string, { score: number; reason: string }> }>();

  get(creatorId: string, day: string) {
    const e = this.entries.get(creatorId);
    return e && e.day === day ? e : null;
  }

  /** True when there is nothing for today, or new campaigns and the last call was over 30 minutes ago. */
  stale(creatorId: string, day: string, ids: string[], now = Date.now()) {
    const e = this.get(creatorId, day);
    if (!e) return true;
    return ids.some((id) => !e.scores.has(id)) && now - e.at > 30 * 60 * 1000;
  }

  set(creatorId: string, day: string, scores: Map<string, { score: number; reason: string }>, now = Date.now()) {
    this.entries.set(creatorId, { day, at: now, scores });
  }
}
