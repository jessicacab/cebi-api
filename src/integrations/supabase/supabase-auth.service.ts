import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  isAuthSessionMissingError,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { toE164 } from '../../auth/token-verifier.service.js';
import { contactParams, type Contact } from '../../common/contact.js';
import type { Env } from '../../config/env.js';
import type { AuthIdentity } from '../../modules/users/users.service.js';
import { knownError, supabaseCode, toApiError } from './supabase-errors.js';

/** A signed-in Supabase session, in the API's own terms. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working. Refresh shortly before. */
  expiresAt: Date;
  identity: AuthIdentity;
}

export interface SignUpResult {
  /** Present when Supabase signs the user in straight away (confirmation off). */
  session: AuthSession | null;
}

/** Supabase answers "no such user" this way when sign-up through codes is off. */
const UNKNOWN_USER_CODES = new Set(['otp_disabled', 'user_not_found', 'signup_disabled']);

/** Throws the mapped error if Supabase returned one. */
const check = <R extends { data: unknown; error: AuthError | null }>(
  result: R,
): Extract<R, { error: null }>['data'] => {
  if (result.error) throw toApiError(result.error);
  return result.data;
};

const toSession = (session: Session | null): AuthSession => {
  if (!session) throw toApiError(new Error('Supabase returned no session'));
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const name = meta.full_name ?? meta.name;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date((session.expires_at ?? Date.now() / 1000 + session.expires_in) * 1000),
    identity: {
      authId: session.user.id,
      email: session.user.email || undefined,
      phone: toE164(session.user.phone),
      name: typeof name === 'string' ? name : undefined,
    },
  };
};

/**
 * Every call cebi-api makes to Supabase Auth. Uses the publishable key, so
 * Supabase applies the same rules as for a normal app sign-in. A new client
 * is made per call so sessions never leak between requests.
 *
 * Tests replace this class with a fake: they must never reach Supabase.
 */
@Injectable()
export class SupabaseAuth {
  private readonly url: string;
  private readonly key: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('SUPABASE_URL', { infer: true });
    this.key = config.get('SUPABASE_PUBLISHABLE_KEY', { infer: true });
  }

  private client(): SupabaseClient {
    return createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  /**
   * Creates the account and sends a 6-digit code to the email or phone.
   * Throws ACCOUNT_EXISTS when the email or number is already confirmed.
   */
  async signUp(contact: Contact, password: string, name?: string): Promise<SignUpResult> {
    const data = check(
      await this.client().auth.signUp({
        ...contactParams(contact),
        password,
        options: { data: name ? { full_name: name } : undefined },
      }),
    );
    // With confirmation on, Supabase hides existing accounts by returning a
    // user with no identities instead of an error.
    if (data.user && data.user.identities?.length === 0) {
      throw knownError('user_already_exists');
    }
    return { session: data.session ? toSession(data.session) : null };
  }

  /** Sends the sign-up code again. */
  async resendSignUpCode(contact: Contact): Promise<void> {
    const params =
      contact.channel === 'email'
        ? { type: 'signup' as const, email: contact.email }
        : { type: 'sms' as const, phone: contact.phone };
    check(await this.client().auth.resend(params));
  }

  /** Checks a sign-up or sign-in code and returns the new session. */
  async verifyCode(contact: Contact, code: string): Promise<AuthSession> {
    const params =
      contact.channel === 'email'
        ? { type: 'email' as const, email: contact.email, token: code }
        : { type: 'sms' as const, phone: contact.phone, token: code };
    return toSession(check(await this.client().auth.verifyOtp(params)).session);
  }

  async signInWithPassword(contact: Contact, password: string): Promise<AuthSession> {
    const result = await this.client().auth.signInWithPassword({
      ...contactParams(contact),
      password,
    });
    return toSession(check(result).session);
  }

  /**
   * Sends a one-time sign-in code to an existing account. Unknown emails or
   * numbers are ignored quietly, so nobody can probe who has an account.
   */
  async sendSignInCode(contact: Contact): Promise<void> {
    const { error } = await this.client().auth.signInWithOtp({
      ...contactParams(contact),
      options: { shouldCreateUser: false },
    });
    if (error && !UNKNOWN_USER_CODES.has(supabaseCode(error) ?? '')) throw toApiError(error);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const result = await this.client().auth.refreshSession({ refresh_token: refreshToken });
    return toSession(check(result).session);
  }

  /** Ends this session in Supabase, so its refresh token stops working. */
  async signOut(accessToken: string): Promise<void> {
    const { error } = await this.client().auth.admin.signOut(accessToken, 'local');
    // Already signed out or expired: nothing left to end.
    const gone = isAuthSessionMissingError(error) || error?.status === 401 || error?.status === 404;
    if (error && !gone) throw toApiError(error);
  }

  /** Sends a password reset code. Unknown emails or numbers are ignored quietly. */
  async sendPasswordResetCode(contact: Contact): Promise<void> {
    const client = this.client();
    const { error } =
      contact.channel === 'email'
        ? await client.auth.resetPasswordForEmail(contact.email)
        : await client.auth.signInWithOtp({
            phone: contact.phone,
            options: { shouldCreateUser: false },
          });
    if (error && !UNKNOWN_USER_CODES.has(supabaseCode(error) ?? '')) throw toApiError(error);
  }

  /** Checks the reset code, sets the new password and returns a session. */
  async resetPassword(contact: Contact, code: string, password: string): Promise<AuthSession> {
    // One client for both calls: it holds the session the code opens.
    const client = this.client();
    const params =
      contact.channel === 'email'
        ? { type: 'recovery' as const, email: contact.email, token: code }
        : { type: 'sms' as const, phone: contact.phone, token: code };
    const session = check(await client.auth.verifyOtp(params)).session;
    check(await client.auth.updateUser({ password }));
    return toSession(session);
  }
}
