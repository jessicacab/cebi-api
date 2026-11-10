import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { CampaignSuggestionsService } from './campaign-suggestions.service.js';
import { CampaignsService, COVER_MAX_BYTES, type UploadedImage } from './campaigns.service.js';
import { SuggestDto } from './dto/suggest.dto.js';
import { CampaignDto, CoverUrlDto, CreateCampaignDto, EstimateCampaignDto, EstimateDto, ListCampaignsQuery } from './dto/campaign.dto.js';

/** Mobile app: a business's own campaigns. */
@ApiTags('Business · Campaigns')
@Roles('BUSINESS')
@Controller('business/campaigns')
export class BusinessCampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly suggestions: CampaignSuggestionsService,
  ) {}

  @Post('suggest')
  @HttpCode(200)
  @ApiOperation({
    summary: 'AI ideas for a field of the campaign being created (talking points, avoid, hashtags, title)',
    description: 'Errors: AI_NOT_CONFIGURED (503), AI_LIMIT_REACHED (429), AI_UNAVAILABLE (502).',
  })
  @ApiOkResponse({ schema: { properties: { suggestions: { type: 'array', items: { type: 'string' } } } } })
  suggest(@CurrentUser() user: User, @Body() dto: SuggestDto) {
    return this.suggestions.suggest(user, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Save a new campaign as a draft', description: 'Errors: VALIDATION_ERROR (field and date problems).' })
  @ApiOkResponse({ type: CampaignDto })
  create(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user, dto);
  }

  @Post('estimate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cebi estimate: matching creators near me and the views a campaign could reach' })
  @ApiOkResponse({ type: EstimateDto })
  estimate(@CurrentUser() user: User, @Body() dto: EstimateCampaignDto) {
    return this.campaigns.estimate(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My campaigns, newest first' })
  @ApiOkResponse({ type: CampaignDto, isArray: true })
  list(@CurrentUser() user: User, @Query() query: ListCampaignsQuery) {
    return this.campaigns.listMine(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my campaigns' })
  @ApiOkResponse({ type: CampaignDto })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.getMine(user, id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit a draft (send the whole campaign, like when creating it)',
    description: 'Errors: CAMPAIGN_NOT_DRAFT, VALIDATION_ERROR, NOT_FOUND.',
  })
  @ApiOkResponse({ type: CampaignDto })
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCampaignDto) {
    return this.campaigns.update(user, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put a draft live', description: 'Errors: CAMPAIGN_NOT_DRAFT, APPLY_DATE_PASSED, NOT_FOUND.' })
  @ApiOkResponse({ type: CampaignDto })
  publish(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.publish(user, id);
  }

  @Post(':id/cover')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: COVER_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Set the cover photo (JPEG, PNG or WebP, up to 5 MB)',
    description:
      'Drafts only. Errors: CAMPAIGN_NOT_DRAFT, UNSUPPORTED_FILE, PAYLOAD_TOO_LARGE, STORAGE_NOT_CONFIGURED, UPLOAD_FAILED, NOT_FOUND.',
  })
  @ApiOkResponse({ type: CampaignDto })
  cover(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: UploadedImage) {
    return this.campaigns.setCover(user, id, file);
  }

  @Put(':id/cover')
  @ApiOperation({ summary: 'Use a photo made with Enhance as the cover (drafts only)', description: 'Errors: CAMPAIGN_NOT_DRAFT, VALIDATION_ERROR, NOT_FOUND.' })
  @ApiOkResponse({ type: CampaignDto })
  coverFromUrl(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CoverUrlDto) {
    return this.campaigns.setCoverFromUrl(user, id, dto.url);
  }

  @Delete(':id/cover')
  @ApiOperation({ summary: "Remove the cover photo (drafts only); the content type's picture shows again" })
  @ApiOkResponse({ type: CampaignDto })
  removeCover(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.removeCover(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft', description: 'Errors: CAMPAIGN_NOT_DRAFT, NOT_FOUND.' })
  @ApiOkResponse({ schema: { properties: { ok: { type: 'boolean' } } } })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.removeDraft(user, id);
  }
}

/** Admin CRM: every campaign. */
@ApiTags('Admin · Campaigns')
@Roles('ADMIN')
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns, newest first' })
  @ApiOkResponse({ type: CampaignDto, isArray: true })
  list(@Query() query: ListCampaignsQuery) {
    return this.campaigns.listAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign' })
  @ApiOkResponse({ type: CampaignDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }
}
