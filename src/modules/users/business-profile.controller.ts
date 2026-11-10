import { Body, Controller, Delete, HttpCode, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { BusinessProfileService, LOGO_MAX_BYTES, type UploadedLogo } from './business-profile.service.js';
import { UpdateBusinessProfileDto } from './dto/business-profile.dto.js';
import { UserDto } from './dto/user.dto.js';

/** Mobile app, business: their own business profile. */
@ApiTags('Business profile')
@Roles('BUSINESS')
@Controller('business/profile')
export class BusinessProfileController {
  constructor(private readonly profiles: BusinessProfileService) {}

  @Patch()
  @ApiOperation({
    summary: 'Update my business details, contact, exact location and social handles (only the fields sent)',
    description: 'Send "" to clear an optional field. Errors: VALIDATION_ERROR (readable details), NOT_FOUND.',
  })
  @ApiOkResponse({ type: UserDto })
  update(@CurrentUser() user: User, @Body() dto: UpdateBusinessProfileDto) {
    return this.profiles.update(user, dto);
  }

  @Post('logo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LOGO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Upload my business logo (PNG, JPEG or WebP, up to 2 MB; PNG with a clear background works best)',
    description: 'Errors: UNSUPPORTED_FILE, PAYLOAD_TOO_LARGE, STORAGE_NOT_CONFIGURED.',
  })
  @ApiOkResponse({ type: UserDto })
  setLogo(@CurrentUser() user: User, @UploadedFile() file?: UploadedLogo) {
    return this.profiles.setLogo(user, file);
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Remove my business logo' })
  @ApiOkResponse({ type: UserDto })
  removeLogo(@CurrentUser() user: User) {
    return this.profiles.removeLogo(user);
  }
}
