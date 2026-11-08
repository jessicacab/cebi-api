import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../modules/users/users.module.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { TokenVerifier } from './token-verifier.service.js';

@Module({
  imports: [UsersModule],
  providers: [
    TokenVerifier,
    // Order matters: sign-in first, then role check.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenVerifier],
})
export class AuthModule {}
