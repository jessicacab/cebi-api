import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
};

describe('validateEnv', () => {
  it('treats blank optional keys as not set, so placeholders in .env are fine', () => {
    const env = validateEnv({ ...base, OPENAI_API_KEY: '', SUPABASE_SECRET_KEY: '', DIRECT_URL: '' });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(env).toMatchObject({
      OPENAI_MODEL: 'gpt-6.1-terra',
      OPENAI_IMAGE_MODEL: 'gpt-image-2.5-flare',
      OPENAI_VIDEO_MODEL: 'sora-2',
      AI_IMAGE_DAILY_LIMIT: 10,
      AI_VIDEO_DAILY_LIMIT: 3,
      VIDEO_MAX_SECONDS: 90,
      PAYMENTS_IN_APP: false,
    });
  });
});
