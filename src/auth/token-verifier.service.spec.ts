import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { TokenVerifier } from './token-verifier.service.js';

// A tiny stand-in for Supabase's public key endpoint, so tokens are checked
// exactly as in production: real signatures, issuer, audience and expiry.
describe('TokenVerifier', () => {
  let server: Server;
  let baseUrl: string;
  let privateKey: CryptoKey;
  let verifier: TokenVerifier;

  beforeAll(async () => {
    const keys = await generateKeyPair('ES256');
    privateKey = keys.privateKey;
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'ES256' };

    server = createServer((req, res) => {
      if (req.url === '/auth/v1/.well-known/jwks.json') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [jwk] }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const config = { get: () => baseUrl };
    verifier = new TokenVerifier(config as never);
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT({ role: 'authenticated', ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('5b8f1f2e-6d0a-4c1e-9a4b-2f3c1d0e9a77')
      .setIssuer(opts.iss ?? `${baseUrl}/auth/v1`)
      .setAudience(opts.aud ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);

  it('accepts a signed-in user and reads email and name', async () => {
    const claims = await verifier.verify(
      await sign({ email: 'maya@example.com', user_metadata: { full_name: 'Maya' } }),
    );
    expect(claims).toMatchObject({
      sub: '5b8f1f2e-6d0a-4c1e-9a4b-2f3c1d0e9a77',
      email: 'maya@example.com',
      name: 'Maya',
    });
  });

  it('rejects a token from another project', async () => {
    await expect(verifier.verify(await sign({}, { iss: 'https://other.supabase.co/auth/v1' }))).rejects.toThrow();
  });

  it('rejects the wrong audience', async () => {
    await expect(verifier.verify(await sign({}, { aud: 'anon' }))).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    await expect(verifier.verify(await sign({}, { exp: '-1m' }))).rejects.toThrow();
  });

  it('rejects non-user roles (e.g. the anon key)', async () => {
    await expect(verifier.verify(await sign({ role: 'anon' }))).rejects.toThrow();
  });

  it('rejects anonymous sign-ins', async () => {
    await expect(verifier.verify(await sign({ is_anonymous: true }))).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('x')
      .setIssuer(`${baseUrl}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(other.privateKey);
    await expect(verifier.verify(forged)).rejects.toThrow();
  });
});
