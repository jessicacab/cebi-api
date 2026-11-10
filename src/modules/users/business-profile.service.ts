import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { apiError } from '../../common/errors.js';
import type { User } from '../../generated/prisma/client.js';
import { FileStorage } from '../../integrations/supabase/file-storage.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { cleanLandline, cleanMobile, cleanText, mergeSocials } from './business-profile-rules.js';
import type { UpdateBusinessProfileDto } from './dto/business-profile.dto.js';
import { UsersService } from './users.service.js';

/** An uploaded image kept in memory (multer). */
export interface UploadedLogo {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * The business's own logo file. Motion end cards and posters use this real
 * file (AI never draws logos), and brand checks compare ads against it.
 */
@Injectable()
export class BusinessProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorage,
    private readonly users: UsersService,
  ) {}

  private async profile(business: User) {
    const profile = await this.prisma.businessProfile.findUnique({ where: { userId: business.id } });
    if (!profile) throw new NotFoundException('Finish setting up your business first.');
    return profile;
  }

  /** Saves the profile's details (only the fields sent). Returns the account. */
  async update(business: User, dto: UpdateBusinessProfileDto) {
    const profile = await this.profile(business);
    const problems: string[] = [];
    const tryClean = <T>(message: string, fn: () => T): T | undefined => {
      try {
        return fn();
      } catch {
        problems.push(message);
        return undefined;
      }
    };
    const name = cleanText(dto.name);
    const city = cleanText(dto.city);
    if (name === null) problems.push('name cannot be empty');
    if (city === null) problems.push('city cannot be empty');
    if ((dto.latitude === undefined) !== (dto.longitude === undefined) || (dto.latitude === null) !== (dto.longitude === null)) {
      problems.push('latitude and longitude go together');
    }
    const data: Prisma.BusinessProfileUpdateInput = {
      ownerFirstName: cleanText(dto.ownerFirstName),
      ownerLastName: cleanText(dto.ownerLastName),
      contactMobile: tryClean('contactMobile must be a mobile number, like 0917 555 0142', () => cleanMobile(dto.contactMobile)),
      contactEmail: cleanText(dto.contactEmail)?.toLowerCase() ?? cleanText(dto.contactEmail),
      landline: tryClean('landline must be a phone number, like (032) 345 6789', () => cleanLandline(dto.landline)),
      street: cleanText(dto.street),
      barangay: cleanText(dto.barangay),
      city: city ?? undefined,
      landmark: cleanText(dto.landmark),
      latitude: dto.latitude,
      longitude: dto.longitude,
    };
    if (dto.socials) {
      const socials = tryClean('Use a handle like @yourshop or a link to the profile', () => mergeSocials(profile.socials, dto.socials!));
      data.socials = socials ? (socials as Prisma.InputJsonValue) : Prisma.DbNull;
    }
    if (problems.length) throw new BadRequestException(problems);
    await this.prisma.$transaction([
      this.prisma.businessProfile.update({ where: { userId: business.id }, data }),
      ...(name ? [this.prisma.user.update({ where: { id: business.id }, data: { name } })] : []),
    ]);
    return this.users.getAccount(business.id);
  }

  /** Saves a new logo and removes the old file. Returns the account. */
  async setLogo(business: User, file?: UploadedLogo) {
    if (!file) throw new BadRequestException(['file is required']);
    const ext = LOGO_TYPES[file.mimetype];
    if (!ext) throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', 'Use a PNG, JPEG or WebP logo.');
    const profile = await this.profile(business);
    // A new name each time, so phones never show a cached old logo.
    const url = await this.storage.upload(`businesses/${business.id}/logo-${Date.now()}.${ext}`, file.buffer, file.mimetype);
    await this.prisma.businessProfile.update({ where: { userId: business.id }, data: { logoUrl: url } });
    if (profile.logoUrl) await this.storage.removeByUrl([profile.logoUrl]);
    return this.users.getAccount(business.id);
  }

  async removeLogo(business: User) {
    const profile = await this.profile(business);
    if (profile.logoUrl) {
      await this.prisma.businessProfile.update({ where: { userId: business.id }, data: { logoUrl: null } });
      await this.storage.removeByUrl([profile.logoUrl]);
    }
    return this.users.getAccount(business.id);
  }
}
