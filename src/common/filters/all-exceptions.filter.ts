import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { errorCode } from '../errors.js';

/**
 * Every error response has the same shape:
 *   { error: { statusCode, code, message, details? } }
 * `code` is stable for apps to switch on ("NOT_FOUND", or a specific one
 * such as "INVALID_CREDENTIALS" thrown with apiError); `message` is readable;
 * `details` lists field problems for validation errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { statusCode, message, details, code: customCode } =
      this.describe(exception);

    if (statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const code =
      customCode ??
      (statusCode === HttpStatus.BAD_REQUEST && details
        ? 'VALIDATION_ERROR'
        : (HttpStatus[statusCode] ?? 'ERROR'));

    res.status(statusCode).json({
      error: { statusCode, code, message, ...(details && { details }) },
    });
  }

  private describe(exception: unknown): {
    statusCode: number;
    message: string;
    details?: string[];
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      // ValidationPipe puts one message per invalid field in an array.
      if (typeof body === 'object' && Array.isArray((body as any).message)) {
        return {
          statusCode,
          message: 'Some fields are invalid',
          details: (body as any).message,
        };
      }
      // apiError(...) sets a specific code, e.g. INVALID_CREDENTIALS.
      return { statusCode, message: exception.message, code: errorCode(exception) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { statusCode: HttpStatus.CONFLICT, message: 'Already exists' };
      }
      if (exception.code === 'P2025') {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Not found' };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong',
    };
  }
}
