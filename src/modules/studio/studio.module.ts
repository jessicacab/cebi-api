import { Module } from '@nestjs/common';
import { MediaModule } from '../../integrations/media/media.module.js';
import { AiModule } from '../../integrations/openai/ai.module.js';
import { SupabaseModule } from '../../integrations/supabase/supabase.module.js';
import { CreatorStudioController, EnhanceController } from './studio.controller.js';
import { StudioMotionService } from './studio-motion.service.js';
import { StudioVideoService } from './studio-video.service.js';
import { StudioService } from './studio.service.js';

/** Cebi Studio: AI plans, captions and photo Enhance (see the cebi-studio skill). */
@Module({
  imports: [AiModule, SupabaseModule, MediaModule],
  controllers: [CreatorStudioController, EnhanceController],
  providers: [StudioService, StudioVideoService, StudioMotionService],
})
export class StudioModule {}
