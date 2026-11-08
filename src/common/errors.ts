import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * An error with a specific `code` for the apps to switch on, e.g.
 * `throw apiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Wrong password')`.
 * AllExceptionsFilter turns it into `{ error: { statusCode, code, message } }`.
 */
export const apiError = (statusCode: HttpStatus, code: string, message: string) =>
  new HttpException({ statusCode, code, message }, statusCode);

/** The `code` an apiError was thrown with, if any. */
export const errorCode = (error: unknown): string | undefined => {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse();
  return typeof body === 'object' && typeof (body as any).code === 'string'
    ? (body as any).code
    : undefined;
};
