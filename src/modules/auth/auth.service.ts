import { HttpStatus, Injectable } from '@nestjs/common';
import { parseContact, type Contact } from '../../common/contact.js';
import { apiError, errorCode } from '../../common/errors.js';
import { SupabaseAuth, type AuthSession } from '../../integrations/supabase/supabase-auth.service.js';
import { UsersService, type Account } from '../users/users.service.js';
import type {
  ContactDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SignupDto,
  VerifyCodeDto,
} from './dto/auth.dto.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  user: Account;
}

/** DTOs already checked the contact, so this only narrows the type. */
const toContact = (raw: string): Contact => {
  const contact = parseContact(raw);
  if (!contact) throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_CONTACT', 'Check your email or mobile number.');
  return contact;
};

/**
 * Sign-up, sign-in and password flows. Supabase Auth does the checking and
 * sends the codes; this service keeps the Cebi user record in step and
 * returns what the app needs to continue.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseAuth,
    private readonly users: UsersService,
  ) {}

  /** Step "Send code" of sign-up. */
  async signup(dto: SignupDto) {
    const contact = toContact(dto.contact);
    const { session } = await this.supabase.signUp(contact, dto.password, dto.name?.trim() || undefined);
    if (!session) return { status: 'CODE_SENT' as const, channel: contact.channel, session: null };
    return { status: 'SIGNED_IN' as const, channel: contact.channel, session: await this.finish(session) };
  }

  async resendSignupCode(dto: ContactDto) {
    const contact = toContact(dto.contact);
    await this.supabase.resendSignUpCode(contact);
    return { channel: contact.channel };
  }

  /** Checks a sign-up code or a one-time sign-in code. */
  async verify(dto: VerifyCodeDto): Promise<AuthResult> {
    return this.finish(await this.supabase.verifyCode(toContact(dto.contact), dto.code));
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const contact = toContact(dto.contact);
    try {
      return await this.finish(await this.supabase.signInWithPassword(contact, dto.password));
    } catch (error) {
      // Signed up but never entered the code: send a fresh one so the app
      // can go straight to the code step.
      if (errorCode(error) === 'VERIFICATION_REQUIRED') {
        await this.supabase.resendSignUpCode(contact).catch(() => undefined);
      }
      throw error;
    }
  }

  /** One-time code login. Same answer whether or not the account exists. */
  async sendLoginCode(dto: ContactDto) {
    const contact = toContact(dto.contact);
    await this.supabase.sendSignInCode(contact);
    return { channel: contact.channel };
  }

  async refresh(dto: RefreshDto): Promise<AuthResult> {
    return this.finish(await this.supabase.refresh(dto.refreshToken));
  }

  async logout(accessToken: string) {
    await this.supabase.signOut(accessToken);
    return { ok: true as const };
  }

  /** Same answer whether or not the account exists. */
  async forgotPassword(dto: ContactDto) {
    const contact = toContact(dto.contact);
    await this.supabase.sendPasswordResetCode(contact);
    return { channel: contact.channel };
  }

  /** Sets the new password and signs the user in. */
  async resetPassword(dto: ResetPasswordDto): Promise<AuthResult> {
    const contact = toContact(dto.contact);
    return this.finish(await this.supabase.resetPassword(contact, dto.code, dto.password));
  }

  /** Makes sure the Cebi user exists and is allowed in, then builds the reply. */
  private async finish(session: AuthSession): Promise<AuthResult> {
    const user = await this.users.findOrCreate(session.identity);
    if (user.status === 'SUSPENDED') {
      await this.supabase.signOut(session.accessToken).catch(() => undefined);
      throw apiError(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
    }
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: await this.users.getAccount(user.id),
    };
  }
}
