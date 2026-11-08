import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators.js';
import type { User } from '../../generated/prisma/client.js';
import { UserDto } from '../users/dto/user.dto.js';
import { CompleteOnboardingDto, OnboardingOptionsDto } from './dto/onboarding.dto.js';
import { onboardingOptions } from './onboarding.options.js';
import { OnboardingService } from './onboarding.service.js';

/** Mobile app sign-up steps: the choices to show, and saving the answers. */
@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Public()
  @Get('options')
  @ApiOperation({ summary: 'Roles, platforms, niches and categories for the sign-up steps' })
  @ApiOkResponse({ type: OnboardingOptionsDto })
  options() {
    return onboardingOptions();
  }

  @Get('handles/:handle')
  @ApiOperation({ summary: 'Check if a creator handle is free' })
  @ApiOkResponse({ schema: { properties: { available: { type: 'boolean' } } } })
  async handle(@CurrentUser() user: User, @Param('handle') handle: string) {
    const clean = handle.trim().replace(/^@+/, '');
    const valid = /^[a-z0-9._]{2,30}$/i.test(clean);
    return { available: valid && (await this.onboarding.isHandleAvailable(user, clean)) };
  }

  @Post()
  @ApiOperation({
    summary: 'Finish sign-up (after the code step)',
    description: 'Errors: ALREADY_ONBOARDED, ROLE_ALREADY_SET, HANDLE_TAKEN, VALIDATION_ERROR.',
  })
  @ApiOkResponse({ type: UserDto })
  complete(@CurrentUser() user: User, @Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(user, dto);
  }
}
