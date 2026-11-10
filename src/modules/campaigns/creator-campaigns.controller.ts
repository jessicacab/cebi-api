import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { CreatorCampaignsService } from './creator-campaigns.service.js';
import { DiscoverQuery } from './dto/creator-campaign.dto.js';

/** Mobile app, creator: finding campaigns and reading one. */
@ApiTags('Campaigns')
@Roles('CREATOR')
@Controller('campaigns')
export class CreatorCampaignsController {
  constructor(private readonly campaigns: CreatorCampaignsService) {}

  // Declared before ':id' so "discover" and "for-you" are not read as ids.
  @Get('discover')
  @ApiOperation({
    summary: "The creator's Campaigns tab",
    description:
      'Their numbers (earned, ongoing, pending, applied), categories, and live campaigns they can still join: featured, ending soon, near you, and "for you" with reasons.',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  discover(@CurrentUser() user: User, @Query() query: DiscoverQuery) {
    return this.campaigns.discover(user, query);
  }

  @Get('for-you')
  @ApiOperation({
    summary: 'Quick match picks: ranked by AI with a personal reason when AI is on, else by the fit rule',
    description: 'source: "AI" or "RULE". Each pick has campaign, score, reasons (rule chips) and aiReason (AI only).',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  forYou(@CurrentUser() user: User) {
    return this.campaigns.forYou(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One campaign, with what to make and include, and whether I can still apply',
    description: 'cantApply: APPLIED, NOT_LIVE, APPLICATIONS_CLOSED, CAMPAIGN_FULL, NOT_ON_PLATFORM, or null.',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(user, id);
  }
}
