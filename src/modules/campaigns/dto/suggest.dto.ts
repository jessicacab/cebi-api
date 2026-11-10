import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SocialPlatform } from '../../../generated/prisma/enums.js';
import { SUGGEST_FIELDS, type SuggestField } from '../campaign-suggestions.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Ask AI for ideas for one field of the campaign being created. */
export class SuggestDto {
  @ApiProperty({ enum: SUGGEST_FIELDS })
  @IsIn(SUGGEST_FIELDS)
  field: SuggestField;

  @ApiPropertyOptional({ maxLength: 200, example: 'Our new ube cheesecake' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  brief?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contentTypeId?: string;

  @ApiPropertyOptional({ enum: SocialPlatform, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SocialPlatform, { each: true })
  platforms?: SocialPlatform[];

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ type: [String], description: 'What the business already has, so AI does not repeat it' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  existing?: string[];
}
