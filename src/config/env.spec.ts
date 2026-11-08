import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u@localhost:5432/cebi',
  SUPABASE_URL: 'https://abcd1234.supabase.co/',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.SWAGGER_ENABLED).toBeUndefined();
    expect(env.SUPABASE_URL).toBe('https://abcd1234.supabase.co');
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('splits CORS origins', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('names every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*SUPABASE_URL[\s\S]*SUPABASE_PUBLISHABLE_KEY/);
  });
});
