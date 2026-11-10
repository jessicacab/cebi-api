import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { CaptionDto, CheckCaptionDto, EnhanceDto, EnhanceTargetQuery, PlanDto } from './dto/studio.dto.js';
import { AnimateDto, MotionDto, PickVariantDto, PolishDto, RedoVariantDto } from './dto/video.dto.js';
import { StudioMotionService } from './studio-motion.service.js';
import { StudioVideoService, VIDEO_UPLOAD_MAX_BYTES, type UploadedVideo } from './studio-video.service.js';
import { PHOTO_MAX_BYTES, StudioService, type UploadedPhoto } from './studio.service.js';

const AI_ERRORS = 'Errors: AI_NOT_CONFIGURED (503), AI_LIMIT_REACHED (429), AI_UNAVAILABLE (502), NOT_FOUND.';

/** Mobile app, creator: Cebi Studio for a piece they owe. */
@ApiTags('Studio')
@Roles('CREATOR')
@Controller('creator/studio')
export class CreatorStudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly videos: StudioVideoService,
    private readonly motion: StudioMotionService,
  ) {}

  @Post('videos/polish')
  @HttpCode(200)
  // Videos go to the API's temp folder (not memory) while ffmpeg works on them.
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: tmpdir() }), limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        pieceId: { type: 'string' },
        look: { type: 'string', enum: ['natural', 'bright', 'warm'] },
        fit: { type: 'string', enum: ['fill', 'blur'] },
        subtitles: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({
    summary: 'Polish my own video: 9:16, color and subtitles from my voice (nothing generated). Runs as a job',
    description: 'Errors: UNSUPPORTED_FILE, VIDEO_TOO_LONG, PAYLOAD_TOO_LARGE, AI_LIMIT_REACHED, NOT_FOUND.',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  polish(@CurrentUser() user: User, @Body() dto: PolishDto, @UploadedFile() file?: UploadedVideo) {
    return this.videos.polish(user, dto, file);
  }

  @Post('videos/animate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'A short AI clip from my real product photo (ad-style campaigns only, labelled AI-generated). Runs as a job',
    description: 'Errors: AI_NOT_CONFIGURED, ANIMATE_NOT_ALLOWED, AI_LIMIT_REACHED, VALIDATION_ERROR, NOT_FOUND.',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  animate(@CurrentUser() user: User, @Body() dto: AnimateDto) {
    return this.videos.animate(user, dto);
  }

  @Post('videos/motion')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Moving ad from my photo: 3 motion design variations (storyboards first, then videos). No AI generation. Runs as a job',
    description: 'Words: 1 to 4, from the campaign or typed by the creator. Errors: MOTION_BUSY, VALIDATION_ERROR, NOT_FOUND.',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  startMotion(@CurrentUser() user: User, @Body() dto: MotionDto) {
    return this.motion.start(user, dto);
  }

  @Post('videos/motion/:jobId/pick')
  @HttpCode(200)
  @ApiOperation({ summary: 'Keep one moving ad variation (the one sent to the business)' })
  @ApiOkResponse({ schema: { type: 'object' } })
  pickMotion(@CurrentUser() user: User, @Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: PickVariantDto) {
    return this.motion.pick(user, jobId, dto.key);
  }

  @Post('videos/motion/:jobId/redo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Make one variation again, with new words if given' })
  @ApiOkResponse({ schema: { type: 'object' } })
  redoMotion(@CurrentUser() user: User, @Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: RedoVariantDto) {
    return this.motion.redo(user, jobId, dto);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'A video job: QUEUED, RUNNING, DONE (with outputUrl) or FAILED (with error)' })
  @ApiOkResponse({ schema: { type: 'object' } })
  job(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.videos.job(user, id);
  }

  @Post('plan')
  @HttpCode(200)
  @ApiOperation({ summary: 'AI hooks, shot list, script and caption for one piece', description: AI_ERRORS })
  @ApiOkResponse({ schema: { type: 'object' } })
  plan(@CurrentUser() user: User, @Body() dto: PlanDto) {
    return this.studio.plan(user, dto);
  }

  @Post('caption')
  @HttpCode(200)
  @ApiOperation({ summary: 'AI caption (new or a rewrite), with the required hashtags, mentions and link added', description: AI_ERRORS })
  @ApiOkResponse({ schema: { type: 'object' } })
  caption(@CurrentUser() user: User, @Body() dto: CaptionDto) {
    return this.studio.caption(user, dto);
  }

  @Post('pieces/:id/photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Save my own photo for a piece (no AI); returns its URL to send', description: 'Errors: UNSUPPORTED_FILE, NOT_FOUND.' })
  @ApiOkResponse({ schema: { properties: { url: { type: 'string' } } } })
  photo(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: UploadedPhoto) {
    return this.studio.uploadPhoto(user, id, file);
  }

  @Post('check-caption')
  @HttpCode(200)
  @ApiOperation({ summary: 'What a caption still needs (no AI)' })
  @ApiOkResponse({ schema: { type: 'object' } })
  checkCaption(@CurrentUser() user: User, @Body() dto: CheckCaptionDto) {
    return this.studio.checkCaption(user, dto);
  }
}

/** Mobile app: Enhance a real photo (creators for a piece, businesses for their cover). */
@ApiTags('Studio')
@Roles('CREATOR', 'BUSINESS')
@Controller('ai/enhance')
export class EnhanceController {
  constructor(private readonly studio: StudioService) {}

  @Get('styles')
  @ApiOperation({ summary: 'Styles allowed here: full for ad-style campaigns and businesses, light fixes otherwise' })
  @ApiOkResponse({ schema: { type: 'object' } })
  styles(@CurrentUser() user: User, @Query() query: EnhanceTargetQuery) {
    return this.studio.enhanceStyles(user, query.pieceId);
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        style: { type: 'string' },
        pieceId: { type: 'string' },
        purpose: { type: 'string', enum: ['post', 'cover'] },
      },
    },
  })
  @ApiOperation({
    summary: 'Two AI-enhanced versions of a real photo (the product stays as it is), plus the original',
    description: `${AI_ERRORS} Also STYLE_NOT_ALLOWED, UNSUPPORTED_FILE, PAYLOAD_TOO_LARGE.`,
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  enhance(@CurrentUser() user: User, @Body() dto: EnhanceDto, @UploadedFile() file?: UploadedPhoto) {
    return this.studio.enhance(user, dto, file);
  }
}
