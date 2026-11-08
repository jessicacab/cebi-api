import { Module } from '@nestjs/common';
import { SupabaseAuth } from './supabase-auth.service.js';

/** Supabase Auth for the sign-in endpoints. The database goes through Prisma. */
@Module({
  providers: [SupabaseAuth],
  exports: [SupabaseAuth],
})
export class SupabaseModule {}
