import { z } from 'zod';

/** An optional setting where an empty value ("KEY=") counts as not set, so blank keys in .env are fine. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  /** Only used by Prisma migrations (prisma.config.ts); optional here. */
  DIRECT_URL: optional(z.url()),
  /** e.g. https://abcd1234.supabase.co (checks sign-in tokens, runs sign-in). */
  SUPABASE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
  /**
   * Supabase publishable key (sb_publishable_..., or the legacy anon key).
   * Used by the sign-in endpoints. Stays on the server: clients never get it.
   */
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /**
   * Supabase secret key (sb_secret_..., or the legacy service_role key). Only
   * for file uploads to Supabase Storage. Optional: without it, uploads answer
   * STORAGE_NOT_CONFIGURED and everything else works.
   */
  SUPABASE_SECRET_KEY: optional(z.string().min(1)),
  /**
   * Stage 1 (launch): false. Businesses pay creators directly and Cebi takes
   * no fee. Stage 2: true, businesses fund cash campaigns through Cebi and the
   * fee below applies. See the cebi-campaigns skill.
   */
  PAYMENTS_IN_APP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Cebi's fee on cash campaigns, in percent, once PAYMENTS_IN_APP is on. */
  CEBI_FEE_PERCENT: z.coerce.number().min(0).max(50).default(10),
  /**
   * OpenAI key for AI features (campaign writing suggestions, AI Quick match).
   * Server only: never sent to the apps. Optional: without it, suggestions
   * answer AI_NOT_CONFIGURED and Quick match uses the simple fit rule.
   */
  OPENAI_API_KEY: optional(z.string().min(1)),
  /** Model for those features. gpt-6.1-terra is fast and cheap; gpt-6-luna is cheaper still. */
  OPENAI_MODEL: z.string().min(1).default('gpt-6.1-terra'),
  /** Model for Enhance (photo edits). gpt-image-2.5-flare is fast; gpt-image-2.5-sunburst is the most precise. */
  OPENAI_IMAGE_MODEL: z.string().min(1).default('gpt-image-2.5-flare'),
  /** AI text uses (suggestions, Studio plans, captions) each user may make per day (keeps the bill in check). */
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(40),
  /** Photo enhancements each user may ask for per day (each makes 2 images, the costly part). */
  AI_IMAGE_DAILY_LIMIT: z.coerce.number().int().min(0).default(10),
  /** Model for "Animate a photo" (AI video from a real photo). */
  OPENAI_VIDEO_MODEL: z.string().min(1).default('sora-2'),
  /** Speech to text for video subtitles (needs timestamps: whisper-1 gives SRT). */
  OPENAI_TRANSCRIBE_MODEL: z.string().min(1).default('whisper-1'),
  /** AI clips each user may make per day (video costs per second, the most costly AI here). */
  AI_VIDEO_DAILY_LIMIT: z.coerce.number().int().min(0).default(3),
  /** Longest video Studio will polish, in seconds (longer files may pass the 50 MB storage limit). */
  VIDEO_MAX_SECONDS: z.coerce.number().int().min(5).max(600).default(90),
  /** Public Storage bucket for campaign covers and files. Created on first upload. */
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('campaign-media'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /**
   * How many proxies (load balancer, CDN) sit in front of the API. Needed so
   * rate limits see each phone's IP instead of the proxy's. 0 when the API
   * is reached directly (local development).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: the app refuses to start with a bad .env. */
export const validateEnv = (raw: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
};
