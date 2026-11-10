import type { Prisma } from '../../generated/prisma/client.js';
import type { CampaignGoalsDto } from './dto/goals.dto.js';

export const GOAL_KEYS = ['impressions', 'reach', 'clicks', 'cpc', 'ctr', 'conversions'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

type Range = { min?: number; max?: number };
const isSet = (n: unknown): n is number => typeof n === 'number';

/** Problems with the targets, as validation messages: each one needs an end, and low can't be above high. */
export const goalProblems = (goals?: CampaignGoalsDto): string[] =>
  GOAL_KEYS.flatMap((key) => {
    const range: Range | undefined = goals?.[key];
    if (!range) return [];
    if (!isSet(range.min) && !isSet(range.max)) return [`goals.${key} needs a min or a max`];
    if (isSet(range.min) && isSet(range.max) && range.min > range.max) return [`goals.${key}: min can not be more than max`];
    return [];
  });

/** Plain JSON with only the targets that were set, or null when there are none. */
export const goalsToJson = (goals?: CampaignGoalsDto): Prisma.InputJsonValue | null => {
  const entries = GOAL_KEYS.flatMap((key) => {
    const range: Range | undefined = goals?.[key];
    if (!range || (!isSet(range.min) && !isSet(range.max))) return [];
    return [[key, { ...(isSet(range.min) && { min: range.min }), ...(isSet(range.max) && { max: range.max }) }] as const];
  });
  return entries.length ? Object.fromEntries(entries) : null;
};
