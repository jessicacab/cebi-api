import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  /** Only used by Prisma migrations (prisma.config.ts); optional here. */
  DIRECT_URL: z.url().optional(),
  /** e.g. https://abcd1234.supabase.co (checks sign-in tokens, runs sign-in). */
  SUPABASE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
  /**
   * Supabase publishable key (sb_publishable_..., or the legacy anon key).
   * Used by the sign-in endpoints. Stays on the server: clients never get it.
   */
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
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
