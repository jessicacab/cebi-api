import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ENHANCE_STYLES } from '../enhance.js';
import { TONES, type Tone } from '../studio-plan.js';

/** Which piece (creator) or content type (business) an enhancement is for. */
export class EnhanceTargetQuery {
  @ApiPropertyOptional({ format: 'uuid', description: 'Creators: the piece the photo is for' })
  @IsOptional()
  @IsUUID()
  pieceId?: string;
}

/** Multipart fields that come with the photo. */
export class EnhanceDto extends EnhanceTargetQuery {
  @ApiProperty({ enum: ENHANCE_STYLES.map((s) => s.id) })
  @IsIn(ENHANCE_STYLES.map((s) => s.id))
  style: string;

  @ApiPropertyOptional({ enum: ['post', 'cover'], default: 'post', description: 'Portrait for posts, landscape for campaign covers' })
  @IsOptional()
  @IsIn(['post', 'cover'])
  purpose?: 'post' | 'cover';
}

export class PlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pieceId: string;

  @ApiPropertyOptional({ enum: TONES, default: 'Natural' })
  @IsOptional()
  @IsIn(TONES)
  tone?: Tone;
}

export class CaptionDto extends PlanDto {
  @ApiPropertyOptional({ maxLength: 2200, description: 'The caption to rewrite, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  current?: string;
}

export class CheckCaptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pieceId: string;

  @ApiProperty({ maxLength: 2200 })
  @IsString()
  @MaxLength(2200)
  caption: string;
}
