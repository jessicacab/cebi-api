import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { User, UserRole } from '../../generated/prisma/client.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Skip sign-in for this route (health checks, webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Only users with one of these roles may call the route. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The signed-in user's database record. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest().user,
);

/** The raw bearer token of the current request (used to sign out). */
export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().accessToken,
);
