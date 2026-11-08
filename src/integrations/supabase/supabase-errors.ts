import { HttpStatus, Logger } from '@nestjs/common';
import { isAuthApiError, isAuthError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { apiError } from '../../common/errors.js';

type Mapped = [HttpStatus, string, string];

const TOO_MANY: Mapped = [
  HttpStatus.TOO_MANY_REQUESTS,
  'TOO_MANY_REQUESTS',
  'Too many attempts. Try again in a few minutes.',
];
const EXPIRED_SESSION: Mapped = [
  HttpStatus.UNAUTHORIZED,
  'SESSION_EXPIRED',
  'Your session has ended. Please log in again.',
];
const ACCOUNT_EXISTS: Mapped = [
  HttpStatus.CONFLICT,
  'ACCOUNT_EXISTS',
  'An account with this email or mobile number already exists. Log in instead.',
];
const SIGNUP_CLOSED: Mapped = [
  HttpStatus.FORBIDDEN,
  'SIGNUP_DISABLED',
  'Sign-up with this method is not available right now.',
];

/**
 * Supabase Auth error codes (AuthApiError.code) and what the apps get back.
 * The apps switch on the second value, so keep those stable.
 */
const KNOWN: Record<string, Mapped> = {
  invalid_credentials: [
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'That email, mobile number or password is not right.',
  ],
  email_not_confirmed: [
    HttpStatus.FORBIDDEN,
    'VERIFICATION_REQUIRED',
    'Verify your email first. We sent you a new code.',
  ],
  phone_not_confirmed: [
    HttpStatus.FORBIDDEN,
    'VERIFICATION_REQUIRED',
    'Verify your mobile number first. We sent you a new code.',
  ],
  otp_expired: [HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'That code is wrong or has expired.'],
  weak_password: [
    HttpStatus.UNPROCESSABLE_ENTITY,
    'WEAK_PASSWORD',
    'Pick a stronger password.',
  ],
  same_password: [
    HttpStatus.UNPROCESSABLE_ENTITY,
    'SAME_PASSWORD',
    'Pick a password you have not used before.',
  ],
  user_banned: [HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended.'],
  sms_send_failed: [
    HttpStatus.BAD_GATEWAY,
    'SMS_FAILED',
    'We could not text that number. Check it and try again.',
  ],
  email_address_invalid: [
    HttpStatus.BAD_REQUEST,
    'INVALID_CONTACT',
    'We cannot send email to that address.',
  ],
  user_already_exists: ACCOUNT_EXISTS,
  email_exists: ACCOUNT_EXISTS,
  phone_exists: ACCOUNT_EXISTS,
  signup_disabled: SIGNUP_CLOSED,
  email_provider_disabled: SIGNUP_CLOSED,
  phone_provider_disabled: SIGNUP_CLOSED,
  over_request_rate_limit: TOO_MANY,
  over_email_send_rate_limit: TOO_MANY,
  over_sms_send_rate_limit: TOO_MANY,
  refresh_token_not_found: EXPIRED_SESSION,
  refresh_token_already_used: EXPIRED_SESSION,
  session_not_found: EXPIRED_SESSION,
  session_expired: EXPIRED_SESSION,
};

const logger = new Logger('SupabaseAuth');

/** Returns the Supabase error code, if the error came from Supabase Auth. */
export const supabaseCode = (error: unknown): string | undefined =>
  isAuthError(error) ? (error.code ?? undefined) : undefined;

/** The apiError for a Supabase error code, e.g. knownError('user_already_exists'). */
export const knownError = (code: keyof typeof KNOWN) => apiError(...KNOWN[code]);

/** Turns any Supabase Auth failure into an apiError the apps understand. */
export const toApiError = (error: unknown) => {
  const known = KNOWN[supabaseCode(error) ?? ''];
  if (known) return apiError(...known);
  // Supabase reports "session_not_found" as this error, without a code.
  if (isAuthSessionMissingError(error)) return apiError(...EXPIRED_SESSION);

  if (isAuthApiError(error)) {
    logger.error(`Unhandled Supabase Auth error ${error.status} ${error.code}: ${error.message}`);
    return apiError(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_ERROR', 'Sign-in failed. Please try again.');
  }

  // Network trouble reaching Supabase, or an unexpected response.
  logger.error(error instanceof Error ? error.stack : error);
  return apiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'AUTH_UNAVAILABLE',
    'Sign-in is unavailable right now. Please try again.',
  );
};
