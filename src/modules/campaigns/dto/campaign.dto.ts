import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
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
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/dto/pagination.js';
import { CampaignStatus, PaymentKind, SocialPlatform } from '../../../generated/prisma/enums.js';
import { ContentTypeDto, DeliverableDto } from '../../content-types/dto/content-type.dto.js';
import { CampaignGoalsDto } from './goals.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimAll = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'must be a date like 2026-10-13';

export const PAY_PARTS = [PaymentKind.FIXED, PaymentKind.COMMISSION, PaymentKind.PRODUCT] as const;
export type PayPart = (typeof PAY_PARTS)[number];
export const KEEP_LIVE_DAYS = [7, 30, 60];
export const AD_USAGE_DAYS = [30, 90, 365];
export const MAX_REVISIONS = 3;

/** Everything from the app's "Create campaign" steps. Saved as a draft. */
export class CreateCampaignDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contentTypeId: string;

  @ApiProperty({ maxLength: 80, example: 'Boodle Feast Launch' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @ApiProperty({ enum: SocialPlatform, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(SocialPlatform, { each: true })
  platforms: SocialPlatform[];

  @ApiProperty({ type: [DeliverableDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DeliverableDto)
  deliverables: DeliverableDto[];

  @ApiPropertyOptional({ type: CampaignGoalsDto, description: 'Optional performance targets for the whole campaign' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignGoalsDto)
  goals?: CampaignGoalsDto;

  // 4 Requirements

  @ApiProperty({ type: [String], example: ['#BoodleFeastCebu'], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(/^#[\p{L}\p{N}_]{1,50}$/u, { each: true, message: 'each hashtag must look like #BoodleFeast' })
  hashtags: string[];

  @ApiProperty({ description: 'Creators must tag the business account' })
  @IsBoolean()
  tagBusiness: boolean;

  @ApiProperty({ type: [String], example: ['@chefjuan'], maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @Matches(/^@[\p{L}\p{N}._]{1,30}$/u, { each: true, message: 'each mention must look like @name' })
  mentions: string[];

  @ApiProperty({ type: [String], maxItems: 6 })
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  talkingPoints: string[];

  @ApiProperty({ type: [String], maxItems: 6, description: 'Things creators should avoid' })
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  avoid: string[];

  @ApiPropertyOptional({ maxLength: 200, description: 'Product link or promo code' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  link?: string;

  @ApiProperty({ description: 'Location sticker or pin (visit types only)' })
  @IsBoolean()
  showLocation: boolean;

  @ApiProperty()
  @IsBoolean()
  reviewDrafts: boolean;

  @ApiProperty({ minimum: 0, maximum: MAX_REVISIONS, description: 'Rounds of changes when drafts are reviewed' })
  @IsInt()
  @Min(0)
  @Max(MAX_REVISIONS)
  revisions: number;

  @ApiPropertyOptional({ enum: KEEP_LIVE_DAYS, description: 'Required when creators post' })
  @IsOptional()
  @IsIn(KEEP_LIVE_DAYS)
  keepLiveDays?: number;

  @ApiPropertyOptional({ enum: AD_USAGE_DAYS, description: 'Leave out when ads are not allowed' })
  @IsOptional()
  @IsIn(AD_USAGE_DAYS)
  adUsageDays?: number;

  // 5 Compensation

  @ApiProperty({ enum: PaymentKind })
  @IsEnum(PaymentKind)
  payment: PaymentKind;

  @ApiPropertyOptional({ enum: PAY_PARTS, isArray: true, description: 'HYBRID only: two or more' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PAY_PARTS, { each: true })
  hybridParts?: PayPart[];

  @ApiPropertyOptional({ minimum: 1, maximum: 999999, description: 'Pesos, with FIXED' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999)
  cashPerCreator?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, description: 'Percent per sale, with COMMISSION' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  commissionPct?: number;

  @ApiPropertyOptional({ maxLength: 120, description: 'Free product or service, with PRODUCT' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  product?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999, description: 'Pesos the free product is worth' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999)
  productValue?: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  slots: number;

  // 6 Timeline

  @ApiProperty({ example: '2026-10-10' })
  @Matches(DAY, { message: `applyBy ${DAY_MESSAGE}` })
  applyBy: string;

  @ApiProperty({ example: '2026-10-12' })
  @Matches(DAY, { message: `contentDue ${DAY_MESSAGE}` })
  contentDue: string;

  @ApiPropertyOptional({ example: '2026-10-13', description: 'Required when creators post' })
  @IsOptional()
  @Matches(DAY, { message: `publishStart ${DAY_MESSAGE}` })
  publishStart?: string;

  @ApiPropertyOptional({ example: '2026-10-30', description: 'Required when creators post' })
  @IsOptional()
  @Matches(DAY, { message: `publishEnd ${DAY_MESSAGE}` })
  publishEnd?: string;

  @ApiProperty({ description: 'Spread posts evenly across the publishing days' })
  @IsBoolean()
  spreadEvenly: boolean;

  @ApiProperty({ type: [String], example: ['Sat 12 PM'], description: 'Visit types only' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  visitTimes: string[];
}

/** A photo made with Enhance, to use as the cover. */
export class CoverUrlDto {
  @ApiProperty({ example: 'https://xyz.supabase.co/storage/v1/object/public/campaign-media/enhance/.../1.jpg' })
  @Matches(/^https:\/\/\S+$/, { message: 'url must be an https link' })
  @MaxLength(500)
  url: string;
}

export class ListCampaignsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

/** The campaign so far, for "Cebi estimate" on the review step. */
export class EstimateCampaignDto extends PickType(CreateCampaignDto, ['platforms', 'deliverables', 'slots'] as const) {
  @ApiPropertyOptional({ format: 'uuid', description: 'No views for types where creators do not post (UGC)' })
  @IsOptional()
  @IsUUID()
  contentTypeId?: string;
}

class ViewRangeDto {
  @ApiProperty() low: number;
  @ApiProperty() high: number;
}

export class EstimateDto {
  @ApiProperty({ type: ViewRangeDto, nullable: true, description: 'Null when creators do not post (UGC)' })
  views: ViewRangeDto | null;
  @ApiProperty({ description: 'Active creators on at least one of the platforms, in the business city' })
  matchingCreators: number;
  @ApiProperty({ type: String, nullable: true, example: 'Cebu City' })
  city: string | null;
  @ApiProperty({ description: 'What the views are based on, to show under the estimate' })
  basis: string;
}

class CostDto {
  @ApiProperty({ description: 'Cash per creator times slots' }) cash: number;
  @ApiProperty({ description: "Cebi's fee on the cash; 0 while payments are not in the app" }) fee: number;
  @ApiProperty({ description: 'Cash plus fee' }) total: number;
  @ApiProperty({
    description: 'True: the business funds the total through Cebi. False (launch): it pays creators directly',
  })
  paidInApp: boolean;
}


/** A campaign as the app receives it. Dates are calendar days (2026-10-13). */
export class CampaignDto extends CreateCampaignDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: CampaignStatus }) status: CampaignStatus;
  @ApiProperty({ type: String, nullable: true, description: "Cover photo; null shows the content type's picture" })
  coverUrl: string | null;
  @ApiProperty({ type: ContentTypeDto, description: 'The whole content type, to reopen a draft for editing' })
  contentType: ContentTypeDto;
  @ApiProperty({ type: CostDto }) cost: CostDto;
  @ApiProperty({ description: 'Creators waiting for a decision' }) pendingApplications: number;
  @ApiProperty({ type: Date, nullable: true }) publishedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
