import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from '../../integrations/supabase/supabase.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/**
 * The /v1/auth endpoints. (src/auth holds the guards that check tokens on
 * every request; this module is where the app gets those tokens.)
 */
@Module({
  imports: [
    // In-memory counters. Move to a shared store (Redis) when running more
    // than one API instance, or each instance counts separately.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
    SupabaseModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthRoutesModule {}
