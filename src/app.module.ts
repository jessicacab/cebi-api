import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { validateEnv } from './config/env.js';
import { AuthRoutesModule } from './modules/auth/auth-routes.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests (Vitest sets NODE_ENV=test) use .env.test only, so they can
      // never touch the Supabase database.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AuthRoutesModule,
    OnboardingModule,
    // New feature modules go here (campaigns, collabs, payments, ...).
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true, // drop fields not in the DTO
        forbidNonWhitelisted: true, // ...and reject requests that send them
        transform: true, // turn query strings into numbers etc.
      }),
    },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
