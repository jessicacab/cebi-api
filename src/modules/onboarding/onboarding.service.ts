import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../../common/errors.js';
import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService, type Account } from '../users/users.service.js';
import type { CompleteOnboardingDto } from './dto/onboarding.dto.js';
import { DEFAULT_CITY } from './onboarding.options.js';

/** Fields each account type needs, as validation messages. */
const missingFields = (dto: CompleteOnboardingDto): string[] => {
  if (dto.role === 'CREATOR') {
    const problems = !dto.platforms?.length ? ['platforms must have at least one item'] : [];
    if (dto.category) problems.push('category is only for businesses');
    return problems;
  }
  const problems = !dto.category ? ['category is required for businesses'] : [];
  if (dto.handle || dto.platforms?.length || dto.niches?.length) {
    problems.push('handle, platforms and niches are only for creators');
  }
  return problems;
};

/** Finishes sign-up: saves the account type, name and creator or business profile. */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async isHandleAvailable(user: User, handle: string): Promise<boolean> {
    const owner = await this.prisma.creatorProfile.findUnique({
      where: { handle: handle.toLowerCase() },
      select: { userId: true },
    });
    return !owner || owner.userId === user.id;
  }

  async complete(user: User, dto: CompleteOnboardingDto): Promise<Account> {
    if (user.onboardedAt) {
      throw apiError(HttpStatus.CONFLICT, 'ALREADY_ONBOARDED', 'Sign-up is already finished.');
    }
    if (user.role === 'ADMIN') {
      throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Admins do not go through sign-up.');
    }
    if (user.role && user.role !== dto.role) {
      throw apiError(HttpStatus.CONFLICT, 'ROLE_ALREADY_SET', 'Account type is already set.');
    }
    const problems = missingFields(dto);
    if (problems.length) throw new BadRequestException(problems);
    if (dto.handle && !(await this.isHandleAvailable(user, dto.handle))) {
      throw apiError(HttpStatus.CONFLICT, 'HANDLE_TAKEN', 'That handle is already on Cebi.');
    }

    const saveProfile =
      dto.role === 'CREATOR'
        ? this.prisma.creatorProfile.create({
            data: {
              userId: user.id,
              handle: dto.handle,
              city: dto.city,
              platforms: dto.platforms ?? [],
              niches: dto.niches ?? [],
            },
          })
        : this.prisma.businessProfile.create({
            data: { userId: user.id, city: dto.city ?? DEFAULT_CITY, category: dto.category! },
          });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { name: dto.name, role: dto.role, onboardedAt: new Date() },
      }),
      saveProfile,
    ]);
    return this.users.getAccount(user.id);
  }
}
