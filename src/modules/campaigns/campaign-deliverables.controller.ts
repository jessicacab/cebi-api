import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { CampaignDeliverablesService } from './campaign-deliverables.service.js';
import { CreatorCollabsService } from './creator-collabs.service.js';
import { OngoingCampaignDto, RequestChangesDto, SubmitPieceDto } from './dto/ongoing.dto.js';

const OK = { schema: { properties: { ok: { type: 'boolean' } } } };

/** Mobile app, business: the Ongoing tab. */
@ApiTags('Business · Campaigns')
@Roles('BUSINESS')
@Controller('business')
export class BusinessDeliverablesController {
  constructor(private readonly deliverables: CampaignDeliverablesService) {}

  @Get('campaigns/ongoing')
  @ApiOperation({ summary: 'Live campaigns with approved creators, their content and what needs attention' })
  @ApiOkResponse({ type: OngoingCampaignDto, isArray: true })
  ongoing(@CurrentUser() user: User) {
    return this.deliverables.ongoing(user);
  }

  @Post('deliverables/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a piece of content', description: 'Errors: NOT_WAITING_FOR_REVIEW, NOT_FOUND.' })
  @ApiOkResponse(OK)
  approve(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliverables.approve(user, id);
  }

  @Post('deliverables/:id/request-changes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a piece back with what to change',
    description: 'Errors: NOT_WAITING_FOR_REVIEW, CHANGES_LIMIT_REACHED, NOT_FOUND.',
  })
  @ApiOkResponse(OK)
  requestChanges(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestChangesDto) {
    return this.deliverables.requestChanges(user, id, dto);
  }

  @Post('campaigns/:id/applications/:applicationId/paid')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record that I paid this creator (stage 1: paid directly)',
    description: 'Errors: NOTHING_TO_PAY, ALREADY_PAID, NOT_ALL_APPROVED, NOT_FOUND.',
  })
  @ApiOkResponse(OK)
  markPaid(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.deliverables.markPaid(user, id, applicationId);
  }
}

/** Mobile app, creator: the Collabs tab and sending content for an approved campaign. */
@ApiTags('Campaigns')
@Roles('CREATOR')
@Controller('creator')
export class CreatorDeliverablesController {
  constructor(
    private readonly deliverables: CampaignDeliverablesService,
    private readonly collabs: CreatorCollabsService,
  ) {}

  @Get('collabs')
  @ApiOperation({
    summary: 'My Collabs: requests waiting (pending, declined), campaigns I am in (with my checklist) and done ones',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  myCollabs(@CurrentUser() user: User) {
    return this.collabs.collabs(user);
  }

  @Post('deliverables/:id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a piece (or a fixed version) for review', description: 'Errors: ALREADY_SUBMITTED, NOT_FOUND.' })
  @ApiOkResponse(OK)
  submit(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitPieceDto) {
    return this.deliverables.submit(user, id, dto);
  }
}
