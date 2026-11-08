import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SocialPlatform, UserRole } from '../../../generated/prisma/enums.js';
import { CATEGORY_IDS, MAX_NICHES, NICHE_IDS } from '../onboarding.options.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Everything from the sign-up steps after the code check. Creators send
 * platforms (and optionally handle and niches); businesses send city and
 * category. The service checks which fields each role needs.
 */
export class CompleteOnboardingDto {
  @ApiProperty({ enum: [UserRole.CREATOR, UserRole.BUSINESS] })
  @IsIn([UserRole.CREATOR, UserRole.BUSINESS])
  role: typeof UserRole.CREATOR | typeof UserRole.BUSINESS;

  @ApiProperty({ maxLength: 80, description: 'Creator name or business name' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'mayaeats', description: 'Creators: main handle, with or without "@"' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@+/, '').toLowerCase() : value))
  @Matches(/^[a-z0-9._]{2,30}$/, {
    message: 'handle can use letters, numbers, "." and "_" (2 to 30 characters)',
  })
  handle?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'Cebu City', description: 'Businesses: required' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ enum: SocialPlatform, isArray: true, description: 'Creators: at least one' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SocialPlatform, { each: true })
  platforms?: SocialPlatform[];

  @ApiPropertyOptional({ enum: NICHE_IDS, isArray: true, maxItems: MAX_NICHES })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_NICHES)
  @IsIn(NICHE_IDS, { each: true })
  niches?: string[];

  @ApiPropertyOptional({ enum: CATEGORY_IDS, description: 'Businesses: required' })
  @IsOptional()
  @IsIn(CATEGORY_IDS)
  category?: string;
}

// Responses (document the API)

class OptionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
}

export class OnboardingOptionsDto {
  @ApiProperty({ type: [OptionDto] }) roles: OptionDto[];
  @ApiProperty({ type: [OptionDto] }) platforms: OptionDto[];
  @ApiProperty({ type: [OptionDto] }) niches: OptionDto[];
  @ApiProperty({ example: MAX_NICHES }) maxNiches: number;
  @ApiProperty({ type: [OptionDto] }) categories: OptionDto[];
  @ApiProperty({ example: 'Cebu City' }) defaultCity: string;
}
