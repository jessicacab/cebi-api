import { Module } from '@nestjs/common';
import { FileStorage, SupabaseStorage } from './file-storage.js';
import { SupabaseAuth } from './supabase-auth.service.js';

/** Supabase Auth for the sign-in endpoints and Storage for uploads. The database goes through Prisma. */
@Module({
  providers: [SupabaseAuth, { provide: FileStorage, useClass: SupabaseStorage }],
  exports: [SupabaseAuth, FileStorage],
})
export class SupabaseModule {}
