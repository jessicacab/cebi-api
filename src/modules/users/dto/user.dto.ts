import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SocialPlatform, UserRole, UserStatus } from '../../../generated/prisma/enums.js';
import { PaginationQuery } from '../../../common/dto/pagination.js';

export class CreatorProfileDto {
  @ApiProperty({ type: String, nullable: true, description: 'Without the "@", lowercase' })
  handle: string | null;
  @ApiProperty({ type: String, nullable: true }) city: string | null;
  @ApiProperty({ enum: SocialPlatform, isArray: true }) platforms: SocialPlatform[];
  @ApiProperty({ type: [String], description: 'Niche ids from /v1/onboarding/options' })
  niches: string[];
}

export class BusinessProfileDto {
  @ApiProperty() city: string;
  @ApiProperty({ description: 'Category id from /v1/onboarding/options' }) category: string;
  @ApiProperty({ type: String, nullable: true, description: 'Real logo file, used on motion end cards and brand checks' })
  logoUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) ownerFirstName: string | null;
  @ApiProperty({ type: String, nullable: true }) ownerLastName: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'E.164; the app shows the sign-in phone when empty' }) contactMobile: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The app shows the sign-in email when empty' }) contactEmail: string | null;
  @ApiProperty({ type: String, nullable: true }) landline: string | null;
  @ApiProperty({ type: String, nullable: true }) street: string | null;
  @ApiProperty({ type: String, nullable: true }) barangay: string | null;
  @ApiProperty({ type: String, nullable: true }) landmark: string | null;
  @ApiProperty({ type: Number, nullable: true }) latitude: number | null;
  @ApiProperty({ type: Number, nullable: true }) longitude: number | null;
  @ApiProperty({ type: Object, nullable: true, example: { tiktok: '@lolanenacebu' } }) socials: Record<string, string> | null;
}

/** Shape returned for a user (documents the API; the DB record is sent as-is). */
export class UserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', description: 'Supabase Auth user id' }) authId: string;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true, example: '+639171234567' }) phone: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Person or business name' })
  name: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ enum: UserRole, nullable: true }) role: UserRole | null;
  @ApiProperty({ enum: UserStatus }) status: UserStatus;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Null until sign-up is finished: send the user to the last sign-up steps',
  })
  onboardedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({ type: CreatorProfileDto, nullable: true })
  creatorProfile?: CreatorProfileDto | null;
  @ApiPropertyOptional({ type: BusinessProfileDto, nullable: true })
  businessProfile?: BusinessProfileDto | null;
}

/** What a user can change about themselves in the app. */
export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: [UserRole.CREATOR, UserRole.BUSINESS],
    description: 'Chosen once during onboarding. Cannot be changed afterwards.',
  })
  @IsOptional()
  @IsIn([UserRole.CREATOR, UserRole.BUSINESS])
  role?: typeof UserRole.CREATOR | typeof UserRole.BUSINESS;
}

export class ListUsersQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Matches name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** What an admin can change about any user. */
export class AdminUpdateUserDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
