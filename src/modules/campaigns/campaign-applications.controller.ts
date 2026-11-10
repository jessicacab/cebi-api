import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { CampaignApplicationsService } from './campaign-applications.service.js';
import { ApplicationDto, ApplicationsDto, ApplyDto } from './dto/application.dto.js';

/** Mobile app, business: creators who asked to join one of my campaigns. */
@ApiTags('Business · Campaigns')
@Roles('BUSINESS')
@Controller('business/campaigns/:id/applications')
export class BusinessApplicationsController {
  constructor(private readonly applications: CampaignApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Creators who applied, with slots taken' })
  @ApiOkResponse({ type: ApplicationsDto })
  list(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.listForBusiness(user, id);
  }

  @Post(':applicationId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a creator (takes a slot)',
    description: 'Errors: CAMPAIGN_NOT_LIVE, APPLICATION_ALREADY_DECIDED, SLOTS_FULL, NOT_FOUND.',
  })
  @ApiOkResponse({ type: ApplicationsDto })
  approve(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applications.decide(user, id, applicationId, 'APPROVED');
  }

  @Post(':applicationId/decline')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Decline a creator',
    description: 'Errors: CAMPAIGN_NOT_LIVE, APPLICATION_ALREADY_DECIDED, NOT_FOUND.',
  })
  @ApiOkResponse({ type: ApplicationsDto })
  decline(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applications.decide(user, id, applicationId, 'DECLINED');
  }
}

/** Mobile app, creator: ask to join a live campaign. */
@ApiTags('Campaigns')
@Roles('CREATOR')
@Controller('campaigns/:id/applications')
export class CreatorApplicationsController {
  constructor(private readonly applications: CampaignApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Ask to join a live campaign',
    description: 'Errors: APPLICATIONS_CLOSED, CAMPAIGN_FULL, NOT_ON_PLATFORM, ALREADY_APPLIED, VALIDATION_ERROR (visit time), NOT_FOUND.',
  })
  @ApiOkResponse({ type: ApplicationDto })
  apply(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) {
    return this.applications.apply(user, id, dto.note, dto.visitTime);
  }

  @Delete()
  @ApiOperation({ summary: 'Withdraw my request (before the business answers)', description: 'Errors: APPLICATION_ALREADY_DECIDED, NOT_FOUND.' })
  @ApiOkResponse({ schema: { properties: { ok: { type: 'boolean' } } } })
  withdraw(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.withdraw(user, id);
  }
}
