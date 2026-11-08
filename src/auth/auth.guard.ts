import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/auth.decorators.js';
import { UsersService } from '../modules/users/users.service.js';
import { TokenVerifier } from './token-verifier.service.js';

/**
 * Runs on every route unless marked @Public().
 * Verifies the Supabase sign-in token and attaches the user's database record to the
 * request, creating it on their first call.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.users.findOrCreate({
      authId: claims.sub,
      email: claims.email,
      phone: claims.phone,
      name: claims.name,
    });
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }

    request.user = user;
    request.accessToken = token;
    return true;
  }
}
