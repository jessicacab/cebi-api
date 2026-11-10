import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CATEGORY_IDS } from '../../onboarding/onboarding.options.js';

/** Filters for the creator's Campaigns tab. */
export class DiscoverQuery {
  @ApiPropertyOptional({ enum: CATEGORY_IDS, description: 'Business category id' })
  @IsOptional()
  @IsIn(CATEGORY_IDS)
  category?: string;

  @ApiPropertyOptional({ maxLength: 60, description: 'Matches the campaign title or business name' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  q?: string;
}
