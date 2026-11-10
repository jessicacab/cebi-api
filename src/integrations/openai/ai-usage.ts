import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../../common/errors.js';
import type { Env } from '../../config/env.js';

export type AiKind = 'text' | 'image' | 'video';

/**
 * How many AI suggestions each user asked for today, so one person can't run
 * up the bill. In memory, like the rate limits: move to Redis or the database
 * when the API runs on several machines.
 */
@Injectable()
export class AiUsage {
  private readonly counts = new Map<string, { day: string; count: number }>();
  private readonly limits: Record<AiKind, number>;

  constructor(config: ConfigService<Env, true>) {
    this.limits = {
      text: config.get('AI_DAILY_LIMIT', { infer: true }),
      image: config.get('AI_IMAGE_DAILY_LIMIT', { infer: true }),
      video: config.get('AI_VIDEO_DAILY_LIMIT', { infer: true }),
    };
  }

  /**
   * Counts one use, or answers AI_LIMIT_REACHED (429) once today's limit is
   * used. Text (suggestions, plans, captions) and images (Enhance, the costly
   * one) have separate limits.
   */
  take(userId: string, kind: AiKind = 'text', now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    const key = `${kind}:${userId}`;
    const entry = this.counts.get(key);
    const count = entry?.day === day ? entry.count : 0;
    if (count >= this.limits[kind]) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'AI_LIMIT_REACHED',
        kind === 'image'
          ? "You've used today's photo enhancements. Try again tomorrow."
          : kind === 'video'
            ? "You've used today's AI clips. Try again tomorrow."
            : "You've used today's AI suggestions. Try again tomorrow.",
      );
    }
    this.counts.set(key, { day, count: count + 1 });
  }
}
