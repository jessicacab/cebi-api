import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import type { Contact } from '../src/common/contact.js';
import { SupabaseAuth } from '../src/integrations/supabase/supabase-auth.service.js';
import { knownError } from '../src/integrations/supabase/supabase-errors.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database; Supabase Auth is replaced by this fake.
// Every code is CODE. Tokens look like "tok|<authId>".
const CODE = '123456';

interface FakeAccount {
  authId: string;
  contact: Contact;
  password: string;
  confirmed: boolean;
  name?: string;
}
const accounts = new Map<string, FakeAccount>();
const keyOf = (c: Contact) => (c.channel === 'email' ? c.email : c.phone);
const find = (c: Contact) => accounts.get(keyOf(c));
const byAuthId = (id: string) => [...accounts.values()].find((a) => a.authId === id);

const session = (a: FakeAccount) => ({
  accessToken: `tok|${a.authId}`,
  refreshToken: `ref|${a.authId}`,
  expiresAt: new Date(Date.now() + 3600_000),
  identity: {
    authId: a.authId,
    email: a.contact.channel === 'email' ? a.contact.email : undefined,
    phone: a.contact.channel === 'sms' ? a.contact.phone : undefined,
    name: a.name,
  },
});

const fakeSupabase = {
  signUp: vi.fn(async (contact: Contact, password: string, name?: string) => {
    const existing = find(contact);
    if (existing?.confirmed) throw knownError('user_already_exists');
    accounts.set(keyOf(contact), {
      authId: existing?.authId ?? randomUUID(),
      contact,
      password,
      confirmed: false,
      name,
    });
    return { session: null };
  }),
  resendSignUpCode: vi.fn(async () => undefined),
  verifyCode: vi.fn(async (contact: Contact, code: string) => {
    const account = find(contact);
    if (!account || code !== CODE) throw knownError('otp_expired');
    account.confirmed = true;
    return session(account);
  }),
  signInWithPassword: vi.fn(async (contact: Contact, password: string) => {
    const account = find(contact);
    if (!account || account.password !== password) throw knownError('invalid_credentials');
    if (!account.confirmed) throw knownError('email_not_confirmed');
    return session(account);
  }),
  sendSignInCode: vi.fn(async () => undefined),
  refresh: vi.fn(async (token: string) => {
    const account = byAuthId(token.replace(/^ref\|/, ''));
    if (!token.startsWith('ref|') || !account) throw knownError('refresh_token_not_found');
    return session(account);
  }),
  signOut: vi.fn(async () => undefined),
  sendPasswordResetCode: vi.fn(async () => undefined),
  resetPassword: vi.fn(async (contact: Contact, code: string, password: string) => {
    const account = find(contact);
    if (!account || code !== CODE) throw knownError('otp_expired');
    account.password = password;
    return session(account);
  }),
};

const fakeVerifier = {
  verify: async (token: string) => {
    const account = byAuthId(token.replace(/^tok\|/, ''));
    if (!token.startsWith('tok|') || !account) throw new Error('bad token');
    const { identity } = session(account);
    return { sub: identity.authId, email: identity.email, phone: identity.phone };
  },
};

describe('Auth and onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const MAYA = 'Maya@Auth.test';
  const PASSWORD = 'Sunrise#2026';
  let mayaToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseAuth)
      .useValue(fakeSupabase)
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const authIds = [...accounts.values()].map((a) => a.authId);
    await prisma.user.deleteMany({ where: { authId: { in: authIds } } });
    await app.close();
  });

  it('serves the sign-up choices without signing in', async () => {
    const res = await api().get('/v1/onboarding/options').expect(200);
    expect(res.body.data.roles.map((r: { id: string }) => r.id)).toEqual(['CREATOR', 'BUSINESS']);
    expect(res.body.data).toMatchObject({ maxNiches: 3, defaultCity: 'Cebu City' });
    expect(res.body.data.platforms[0]).toEqual({ id: 'TIKTOK', name: 'TikTok', description: 'Short videos' });
  });

  it('rejects a bad contact or a weak password at sign-up', async () => {
    const bad = await api()
      .post('/v1/auth/signup')
      .send({ contact: '0817 123', password: 'weakpassword' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        'contact must be a valid email or mobile number',
        'password needs a capital letter, number or symbol',
      ]),
    );
    expect(fakeSupabase.signUp).not.toHaveBeenCalled();
  });

  it('signs up with email and asks for the code', async () => {
    const res = await api()
      .post('/v1/auth/signup')
      .send({ contact: MAYA, password: PASSWORD, name: 'Maya' })
      .expect(200);
    expect(res.body.data).toEqual({ status: 'CODE_SENT', channel: 'email', session: null });
    // The email is cleaned up before it reaches Supabase.
    expect(fakeSupabase.signUp).toHaveBeenCalledWith(
      { channel: 'email', email: 'maya@auth.test' },
      PASSWORD,
      'Maya',
    );
  });

  it('sends a fresh code when an unverified user tries to log in', async () => {
    const res = await api().post('/v1/auth/login').send({ contact: MAYA, password: PASSWORD }).expect(403);
    expect(res.body.error.code).toBe('VERIFICATION_REQUIRED');
    expect(fakeSupabase.resendSignUpCode).toHaveBeenCalledWith({ channel: 'email', email: 'maya@auth.test' });
  });

  it('rejects a wrong code', async () => {
    const res = await api().post('/v1/auth/verify').send({ contact: MAYA, code: '000000' }).expect(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CODE', message: 'That code is wrong or has expired.' });
  });

  it('verifies the code, signs in and creates the Cebi user', async () => {
    const res = await api().post('/v1/auth/verify').send({ contact: MAYA, code: CODE }).expect(200);
    const { accessToken, refreshToken, expiresAt, user } = res.body.data;
    expect(accessToken).toMatch(/^tok\|/);
    expect(refreshToken).toMatch(/^ref\|/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(user).toMatchObject({
      email: 'maya@auth.test',
      name: 'Maya',
      role: null,
      onboardedAt: null,
      creatorProfile: null,
      businessProfile: null,
    });
    mayaToken = accessToken;
  });

  it('needs a signed-in user to finish sign-up', async () => {
    await api().post('/v1/onboarding').send({ role: 'CREATOR', name: 'Maya' }).expect(401);
  });

  it('asks creators for at least one platform', async () => {
    const res = await api()
      .post('/v1/onboarding')
      .set(bearer(mayaToken))
      .send({ role: 'CREATOR', name: 'Maya', category: 'cafe' })
      .expect(400);
    expect(res.body.error.details).toEqual([
      'platforms must have at least one item',
      'category is only for businesses',
    ]);
  });

  it('rejects unknown niches and too many niches', async () => {
    const res = await api()
      .post('/v1/onboarding')
      .set(bearer(mayaToken))
      .send({ role: 'CREATOR', name: 'Maya', platforms: ['TIKTOK'], niches: ['food', 'travel', 'tech', 'cars'] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('finishes sign-up as a creator', async () => {
    const res = await api()
      .post('/v1/onboarding')
      .set(bearer(mayaToken))
      .send({
        role: 'CREATOR',
        name: ' Maya Santos ',
        handle: '@MayaEats',
        platforms: ['TIKTOK', 'INSTAGRAM'],
        niches: ['food', 'travel'],
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Maya Santos',
      role: 'CREATOR',
      creatorProfile: { handle: 'mayaeats', platforms: ['TIKTOK', 'INSTAGRAM'], niches: ['food', 'travel'] },
      businessProfile: null,
    });
    expect(res.body.data.onboardedAt).not.toBeNull();

    const again = await api()
      .post('/v1/onboarding')
      .set(bearer(mayaToken))
      .send({ role: 'CREATOR', name: 'Maya', platforms: ['TIKTOK'] })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_ONBOARDED');
  });

  it('returns the profile from /v1/users/me', async () => {
    const res = await api().get('/v1/users/me').set(bearer(mayaToken)).expect(200);
    expect(res.body.data.creatorProfile.handle).toBe('mayaeats');
  });

  it('signs up a business with a PH mobile number', async () => {
    const signup = await api()
      .post('/v1/auth/signup')
      .send({ contact: '0917 123 4567', password: PASSWORD, name: 'Kape Kalye' })
      .expect(200);
    expect(signup.body.data).toMatchObject({ status: 'CODE_SENT', channel: 'sms' });

    const verify = await api().post('/v1/auth/verify').send({ contact: '+639171234567', code: CODE }).expect(200);
    const token = verify.body.data.accessToken;
    expect(verify.body.data.user.phone).toBe('+639171234567');

    const handle = await api().get('/v1/onboarding/handles/@MAYAEATS').set(bearer(token)).expect(200);
    expect(handle.body.data).toEqual({ available: false });

    const done = await api()
      .post('/v1/onboarding')
      .set(bearer(token))
      .send({ role: 'BUSINESS', name: 'Kape Kalye', category: 'cafe' })
      .expect(201);
    expect(done.body.data).toMatchObject({
      role: 'BUSINESS',
      businessProfile: { city: 'Cebu City', category: 'cafe' },
      creatorProfile: null,
    });
  });

  it('refuses to sign up the same email twice', async () => {
    const res = await api().post('/v1/auth/signup').send({ contact: MAYA, password: PASSWORD }).expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
  });

  it('logs in with a password', async () => {
    const wrong = await api().post('/v1/auth/login').send({ contact: MAYA, password: 'Nope#1234' }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const res = await api().post('/v1/auth/login').send({ contact: MAYA, password: PASSWORD }).expect(200);
    expect(res.body.data.user).toMatchObject({ role: 'CREATOR', creatorProfile: { handle: 'mayaeats' } });
  });

  it('sends one-time login codes without revealing who has an account', async () => {
    const res = await api().post('/v1/auth/login/code').send({ contact: '09998887777' }).expect(200);
    expect(res.body.data).toEqual({ channel: 'sms' });
    expect(fakeSupabase.sendSignInCode).toHaveBeenCalledWith({ channel: 'sms', phone: '+639998887777' });
  });

  it('refreshes tokens', async () => {
    const maya = find({ channel: 'email', email: 'maya@auth.test' })!;
    const res = await api().post('/v1/auth/refresh').send({ refreshToken: `ref|${maya.authId}` }).expect(200);
    expect(res.body.data.user.email).toBe('maya@auth.test');

    const bad = await api().post('/v1/auth/refresh').send({ refreshToken: 'nope' }).expect(401);
    expect(bad.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('logs out with the bearer token', async () => {
    await api().post('/v1/auth/logout').expect(401);
    const res = await api().post('/v1/auth/logout').set(bearer(mayaToken)).expect(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(fakeSupabase.signOut).toHaveBeenCalledWith(mayaToken);
  });

  it('resets a forgotten password with a code', async () => {
    const forgot = await api().post('/v1/auth/password/forgot').send({ contact: MAYA }).expect(200);
    expect(forgot.body.data).toEqual({ channel: 'email' });

    const weak = await api()
      .post('/v1/auth/password/reset')
      .send({ contact: MAYA, code: CODE, password: 'short' })
      .expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const NEW = 'Moonlight#2026';
    const reset = await api().post('/v1/auth/password/reset').send({ contact: MAYA, code: CODE, password: NEW }).expect(200);
    expect(reset.body.data.user.email).toBe('maya@auth.test');
    await api().post('/v1/auth/login').send({ contact: MAYA, password: NEW }).expect(200);
  });

  it('keeps suspended users out', async () => {
    await prisma.user.updateMany({ where: { email: 'maya@auth.test' }, data: { status: 'SUSPENDED' } });
    const res = await api().post('/v1/auth/login').send({ contact: MAYA, password: 'Moonlight#2026' }).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rate limits code requests', async () => {
    // Three per minute per IP; one was used above.
    await api().post('/v1/auth/password/forgot').send({ contact: MAYA }).expect(200);
    await api().post('/v1/auth/password/forgot').send({ contact: MAYA }).expect(200);
    const res = await api().post('/v1/auth/password/forgot').send({ contact: MAYA }).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
