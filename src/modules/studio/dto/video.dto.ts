import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { VIDEO_FITS, VIDEO_LOOKS, type VideoFit, type VideoLook } from '../../../integrations/media/video-filters.js';
import { CLIP_MOTIONS, CLIP_SECONDS, type ClipSeconds } from '../animate.js';
import { MOTION_WORD_MAX, MOTION_WORDS_MAX } from '../motion-words.js';

/** Multipart fields with the video. */
export class PolishDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pieceId: string;

  @ApiPropertyOptional({ enum: VIDEO_LOOKS, default: 'natural' })
  @IsOptional()
  @IsIn(VIDEO_LOOKS)
  look?: VideoLook;

  @ApiPropertyOptional({ enum: VIDEO_FITS, default: 'fill', description: 'fill crops to 9:16; blur keeps the whole frame over a blurred copy' })
  @IsOptional()
  @IsIn(VIDEO_FITS)
  fit?: VideoFit;

  @ApiPropertyOptional({ default: true, description: 'Subtitles from your voice (needs AI)' })
  @IsOptional()
  // Multipart sends text: "true" / "false".
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  subtitles?: boolean;
}

export class AnimateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pieceId: string;

  @ApiProperty({ description: 'A photo you added (pieces/...) or enhanced (enhance/...) in Cebi' })
  @Matches(/^https:\/\/\S+$/, { message: 'imageUrl must be an https link' })
  @MaxLength(500)
  imageUrl: string;

  @ApiProperty({ enum: CLIP_MOTIONS.map((m) => m.id) })
  @IsIn(CLIP_MOTIONS.map((m) => m.id))
  motion: string;

  @ApiPropertyOptional({ enum: CLIP_SECONDS, default: '4' })
  @IsOptional()
  @IsIn(CLIP_SECONDS)
  seconds?: ClipSeconds;
}

export class MotionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pieceId: string;

  @ApiProperty({ description: 'A photo you added (pieces/...) or enhanced (enhance/...) in Cebi' })
  @Matches(/^https:\/\/\S+$/, { message: 'imageUrl must be an https link' })
  @MaxLength(500)
  imageUrl: string;

  @ApiProperty({ type: [String], example: ['New', 'Cookie', 'Flavor'], description: '1 to 4 short words, shown one at a time' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MOTION_WORDS_MAX)
  @IsString({ each: true })
  @MaxLength(MOTION_WORD_MAX, { each: true })
  words: string[];

  @ApiPropertyOptional({ description: "For the end card: one of the brief's promo code, link or hashtags (from GET /ai/enhance/styles)" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cta?: string;
}

export class PickVariantDto {
  @ApiProperty({ enum: ['A', 'B', 'C'] })
  @IsIn(['A', 'B', 'C'])
  key: 'A' | 'B' | 'C';
}

export class RedoVariantDto extends PickVariantDto {
  @ApiPropertyOptional({ type: [String], description: 'New words for this variation only' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MOTION_WORDS_MAX)
  @IsString({ each: true })
  @MaxLength(MOTION_WORD_MAX, { each: true })
  words?: string[];
}
