import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../integrations/supabase/supabase.module.js';
import { BusinessProfileController } from './business-profile.controller.js';
import { BusinessProfileService } from './business-profile.service.js';
import { AdminUsersController, UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SupabaseModule],
  controllers: [UsersController, BusinessProfileController, AdminUsersController],
  providers: [UsersService, BusinessProfileService],
  exports: [UsersService],
})
export class UsersModule {}
