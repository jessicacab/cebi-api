import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../config/env.js';

export interface TokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  /** E.164 with "+", for users who signed up with a mobile number. */
  phone?: string;
  name?: string;
}

/** Supabase stores phone numbers without the "+". */
export const toE164 = (phone: unknown): string | undefined =>
  typeof phone === 'string' && phone ? `+${phone.replace(/^\+/, '')}` : undefined;

/**
 * Checks Supabase Auth access tokens: signature, issuer, audience and expiry.
 * Uses the project's public signing keys (JWKS), so no secret is stored here.
 * The project must use asymmetric "JWT Signing Keys" (the default for new
 * Supabase projects); with legacy HS256 secrets the JWKS endpoint is empty.
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<Env, true>) {
    this.issuer = `${config.get('SUPABASE_URL', { infer: true })}/auth/v1`;
    // Keys are fetched once and cached by jose.
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async verify(token: string): Promise<TokenClaims> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: 'authenticated',
    });

    // Signed-in users only: rejects anon keys and anonymous sign-ins.
    if (!payload.sub || payload.role !== 'authenticated') {
      throw new Error('Not a signed-in user token');
    }
    if (payload.is_anonymous === true) {
      throw new Error('Anonymous sessions are not allowed');
    }

    // Google/Apple put the display name in user_metadata.
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const name = meta.full_name ?? meta.name;

    return {
      ...payload,
      sub: payload.sub,
      email: typeof payload.email === 'string' && payload.email ? payload.email : undefined,
      phone: toE164(payload.phone),
      name: typeof name === 'string' ? name : undefined,
    };
  }
}
