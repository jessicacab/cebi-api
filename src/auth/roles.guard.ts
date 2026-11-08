import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/auth.decorators.js';
import type { User, UserRole } from '../generated/prisma/client.js';

/** Enforces @Roles(...). Runs after AuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles?.length) return true;

    const user: User | undefined = ctx.switchToHttp().getRequest().user;
    if (!user?.role || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
