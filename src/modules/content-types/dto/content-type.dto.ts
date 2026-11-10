import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SocialPlatform } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "TIKTOK,INSTAGRAM" or ?platforms=TIKTOK&platforms=INSTAGRAM, as a list. */
const toList = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;

/** App: filter content types by the platforms the business picked. */
export class ListContentTypesQuery {
  @ApiPropertyOptional({
    enum: SocialPlatform,
    isArray: true,
    example: 'TIKTOK,INSTAGRAM',
    description: 'Comma separated. Only types that work on every one of these are returned.',
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsEnum(SocialPlatform, { each: true })
  platforms?: SocialPlatform[];
}

export const CONTENT_FORMATS = ['VIDEO', 'PHOTO'] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const PAYMENT_KINDS = ['FIXED', 'COMMISSION', 'PRODUCT', 'HYBRID'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** One line of what each creator makes, e.g. 4 videos of 30 to 60 seconds. */
export class DeliverableDto {
  @ApiProperty({ enum: CONTENT_FORMATS, example: 'VIDEO' })
  @IsIn(CONTENT_FORMATS)
  format: ContentFormat;

  @ApiProperty({ example: 4, minimum: 1, maximum: 30, description: 'How many during the campaign' })
  @IsInt()
  @Min(1)
  @Max(30)
  count: number;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 3600, description: 'Videos only: shortest length' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  minSeconds?: number;

  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 3600, description: 'Videos only: longest length' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  maxSeconds?: number;
}

/** A content type as the app and admin receive it. */
export class ContentTypeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'sponsored-content', description: 'Stable id, never changes' }) slug: string;
  @ApiProperty({ example: 'Sponsored Content' }) name: string;
  @ApiProperty() description: string;
  @ApiProperty({ example: 'A creator promotes a restaurant or cafe.' }) example: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '/static/content-types/sponsored-content.jpg',
    description: 'A full URL, or a path on this API (starts with "/"): prefix it with the API address',
  })
  imageUrl: string | null;
  @ApiProperty({ type: [DeliverableDto] }) deliverables: DeliverableDto[];
  @ApiProperty({ example: 14, description: 'Suggested campaign length in days' })
  defaultDurationDays: number;
  @ApiProperty({
    enum: PAYMENT_KINDS,
    description: 'How creators are usually paid: FIXED, COMMISSION, PRODUCT (free product or service) or HYBRID',
  })
  defaultPayment: PaymentKind;
  @ApiProperty({ enum: SocialPlatform, isArray: true, description: 'Platforms this type works on' })
  platforms: SocialPlatform[];
  @ApiProperty({ description: 'Creators come to the business, so ask for visit times' })
  requiresVisit: boolean;
  @ApiProperty({ description: 'False when creators only hand over the videos (UGC)' })
  postsOnCreatorAccount: boolean;
  @ApiProperty({ description: 'Lower comes first' }) sortOrder: number;
  @ApiProperty({ description: 'Hidden from businesses when false' }) active: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/** Admin: add a content type. */
export class CreateContentTypeDto {
  @ApiProperty({ example: 'live-selling', description: 'Lowercase words joined by "-". Cannot be changed later.' })
  @Transform(trim)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be lowercase words joined by "-"' })
  @MaxLength(40)
  slug: string;

  @ApiProperty({ maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  example: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'https URL or a path on this API' })
  @IsOptional()
  @Matches(/^(https?:\/\/|\/)\S+$/, { message: 'imageUrl must be a URL or a path starting with "/"' })
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiProperty({ type: [DeliverableDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DeliverableDto)
  deliverables: DeliverableDto[];

  @ApiPropertyOptional({ default: 14, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultDurationDays?: number;

  @ApiPropertyOptional({ enum: PAYMENT_KINDS, default: 'FIXED' })
  @IsOptional()
  @IsIn(PAYMENT_KINDS)
  defaultPayment?: PaymentKind;

  @ApiPropertyOptional({ enum: SocialPlatform, isArray: true, description: 'Defaults to all platforms' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(SocialPlatform, { each: true })
  platforms?: SocialPlatform[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresVisit?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  postsOnCreatorAccount?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Admin: change any field except the slug. Set active to false to hide it. */
export class UpdateContentTypeDto extends PartialType(OmitType(CreateContentTypeDto, ['slug'] as const)) {}
