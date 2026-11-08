import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Paginated } from '../dto/pagination.js';

/**
 * Every successful response has the same shape:
 *   { data: ... }                 single item or plain result
 *   { data: [...], meta: {...} }  paginated list
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result) =>
        result instanceof Paginated
          ? { data: result.items, meta: result.meta }
          : { data: result ?? null },
      ),
    );
  }
}
