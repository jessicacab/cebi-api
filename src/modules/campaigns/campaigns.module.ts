import { Module } from '@nestjs/common';
import { AiModule } from '../../integrations/openai/ai.module.js';
import { SupabaseModule } from '../../integrations/supabase/supabase.module.js';
import { BusinessApplicationsController, CreatorApplicationsController } from './campaign-applications.controller.js';
import { CampaignApplicationsService } from './campaign-applications.service.js';
import { CampaignSuggestionsService } from './campaign-suggestions.service.js';
import { BusinessDeliverablesController, CreatorDeliverablesController } from './campaign-deliverables.controller.js';
import { CampaignDeliverablesService } from './campaign-deliverables.service.js';
import { AdminCampaignsController, BusinessCampaignsController } from './campaigns.controller.js';
import { CreatorCampaignsController } from './creator-campaigns.controller.js';
import { CreatorCampaignsService } from './creator-campaigns.service.js';
import { CreatorCollabsService } from './creator-collabs.service.js';
import { CampaignsService } from './campaigns.service.js';

@Module({
  imports: [SupabaseModule, AiModule],
  controllers: [
    // Before BusinessCampaignsController so /business/campaigns/ongoing is not read as an :id.
    BusinessDeliverablesController,
    BusinessCampaignsController,
    BusinessApplicationsController,
    CreatorApplicationsController,
    CreatorCampaignsController,
    CreatorDeliverablesController,
    AdminCampaignsController,
  ],
  providers: [
    CampaignsService,
    CampaignApplicationsService,
    CampaignDeliverablesService,
    CreatorCampaignsService,
    CreatorCollabsService,
    CampaignSuggestionsService,
  ],
})
export class CampaignsModule {}
