import { HttpException } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SupabaseAuth } from './supabase-auth.service.js';

// A tiny stand-in for Supabase Auth's HTTP API, so the adapter runs the real
// supabase-js code without reaching Supabase. Each test sets the replies.
interface Seen {
  method: string;
  url: string;
  auth?: string;
  body: Record<string, any>;
}
type Reply = [status: number, body: unknown];

const AUTH_ID = '5b8f1f2e-6d0a-4c1e-9a4b-2f3c1d0e9a77';
const user = (extra: Record<string, unknown> = {}) => ({
  id: AUTH_ID,
  aud: 'authenticated',
  email: '',
  phone: '639171234567',
  user_metadata: { full_name: 'Kape Kalye' },
  app_metadata: {},
  identities: [{ id: 'i1' }],
  created_at: '2026-11-07T00:00:00Z',
  ...extra,
});
const sessionBody = () => ({
  access_token: 'at',
  refresh_token: 'rt',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: user(),
});
const failure = (status: number, code: string): Reply => [status, { code, msg: code }];

const readBody = (req: IncomingMessage) =>
  new Promise<Record<string, any>>((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const e = error as HttpException;
    return { status: e.getStatus(), code: (e.getResponse() as { code: string }).code };
  }
  throw new Error('expected an error');
};

describe('SupabaseAuth', () => {
  let server: Server;
  let auth: SupabaseAuth;
  let seen: Seen[];
  let replies: Record<string, Reply>;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      const path = (req.url ?? '').replace(/^\/auth\/v1/, '');
      seen.push({ method: req.method!, url: path, auth: req.headers.authorization, body });
      const [status, reply] = replies[`${req.method} ${path}`] ?? [404, { code: 'not_found', msg: 'no reply set' }];
      res.writeHead(status, { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' });
      res.end(JSON.stringify(reply));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const values: Record<string, string> = { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
    auth = new SupabaseAuth({ get: (k: string) => values[k] } as never);
  });

  beforeEach(() => {
    seen = [];
    replies = {};
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('signs up with a phone and waits for the code', async () => {
    replies['POST /signup'] = [200, user()];
    const result = await auth.signUp({ channel: 'sms', phone: '+639171234567' }, 'Sunrise#2026', 'Kape Kalye');
    expect(result).toEqual({ session: null });
    expect(seen[0].body).toMatchObject({
      phone: '+639171234567',
      password: 'Sunrise#2026',
      data: { full_name: 'Kape Kalye' },
    });
  });

  it('spots an existing account behind Supabase\'s disguised reply', async () => {
    replies['POST /signup'] = [200, user({ identities: [] })];
    const error = await errorOf(auth.signUp({ channel: 'email', email: 'maya@example.com' }, 'Sunrise#2026'));
    expect(error).toEqual({ status: 409, code: 'ACCOUNT_EXISTS' });
  });

  it('turns a verified code into a session', async () => {
    replies['POST /verify'] = [200, sessionBody()];
    const session = await auth.verifyCode({ channel: 'sms', phone: '+639171234567' }, '123456');
    expect(seen[0].body).toMatchObject({ phone: '+639171234567', token: '123456', type: 'sms' });
    expect(session).toMatchObject({
      accessToken: 'at',
      refreshToken: 'rt',
      identity: { authId: AUTH_ID, phone: '+639171234567', email: undefined, name: 'Kape Kalye' },
    });
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('maps a wrong password to INVALID_CREDENTIALS', async () => {
    replies['POST /token?grant_type=password'] = failure(400, 'invalid_credentials');
    const error = await errorOf(auth.signInWithPassword({ channel: 'email', email: 'maya@example.com' }, 'nope'));
    expect(error).toEqual({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('maps an expired code to INVALID_CODE', async () => {
    replies['POST /verify'] = failure(403, 'otp_expired');
    const error = await errorOf(auth.verifyCode({ channel: 'email', email: 'maya@example.com' }, '000000'));
    expect(error).toEqual({ status: 400, code: 'INVALID_CODE' });
  });

  it('sends login codes only to existing accounts, quietly', async () => {
    replies['POST /otp'] = failure(422, 'otp_disabled');
    await auth.sendSignInCode({ channel: 'sms', phone: '+639998887777' });
    expect(seen[0].body).toMatchObject({ phone: '+639998887777', create_user: false });
  });

  it('treats an already ended session as signed out', async () => {
    replies['POST /logout?scope=local'] = failure(404, 'session_not_found');
    await auth.signOut('at');
    expect(seen[0].auth).toBe('Bearer at');
  });

  it('reports an ended session on refresh as SESSION_EXPIRED', async () => {
    replies['POST /token?grant_type=refresh_token'] = failure(400, 'refresh_token_not_found');
    const error = await errorOf(auth.refresh('old'));
    expect(error).toEqual({ status: 401, code: 'SESSION_EXPIRED' });
  });

  it('resets a password with the code from email', async () => {
    replies['POST /verify'] = [200, sessionBody()];
    replies['PUT /user'] = [200, user()];
    const session = await auth.resetPassword({ channel: 'email', email: 'maya@example.com' }, '123456', 'Moonlight#2026');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(['POST /verify', 'PUT /user']);
    expect(seen[0].body).toMatchObject({ email: 'maya@example.com', token: '123456', type: 'recovery' });
    expect(seen[1]).toMatchObject({ auth: 'Bearer at', body: { password: 'Moonlight#2026' } });
    expect(session.accessToken).toBe('at');
  });

  it('reports Supabase being down as AUTH_UNAVAILABLE', async () => {
    replies['POST /token?grant_type=password'] = [503, { msg: 'down' }];
    const error = await errorOf(auth.signInWithPassword({ channel: 'email', email: 'maya@example.com' }, 'x'));
    expect(error).toEqual({ status: 503, code: 'AUTH_UNAVAILABLE' });
  });
});
