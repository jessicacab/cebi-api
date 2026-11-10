import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { DeliverableStatus, SocialPlatform } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** The business asks a creator to fix a piece. */
export class RequestChangesDto {
  @ApiProperty({ maxLength: 500, example: 'Please add our tag and show the price.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  feedback: string;
}

/** A creator sends a piece: the post link, or a link to the file (UGC, drafts). */
export class SubmitPieceDto {
  @ApiProperty({ example: 'https://www.tiktok.com/@bea/video/123' })
  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['https'] }, { message: 'contentUrl must be an https link' })
  @MaxLength(500)
  contentUrl: string;

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ description: 'With an AI-enhanced photo: the original, so the business can compare' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] }, { message: 'originalUrl must be an https link' })
  @MaxLength(500)
  originalUrl?: string;
}

class PieceDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['VIDEO', 'PHOTO'] }) format: string;
  @ApiProperty({ enum: SocialPlatform, nullable: true, description: 'Null when creators do not post (UGC)' })
  platform: SocialPlatform | null;
  @ApiProperty({ description: '1, 2, 3 within the same format and platform' }) number: number;
  @ApiProperty({ type: Number, nullable: true }) minSeconds: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxSeconds: number | null;
  @ApiProperty({ enum: DeliverableStatus }) status: DeliverableStatus;
  @ApiProperty({ description: 'Not sent (or sent back) after the content due day' }) late: boolean;
  @ApiProperty({ type: String, nullable: true }) contentUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) caption: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The original, when the photo is AI-enhanced' }) originalUrl: string | null;
  @ApiProperty({ description: 'Sent photo was made with Enhance' }) aiEnhanced: boolean;
  @ApiProperty({ type: Date, nullable: true }) submittedAt: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Last change request' }) feedback: string | null;
  @ApiProperty() revisionsUsed: number;
  @ApiProperty({ description: 'Change requests still allowed on this piece' }) changesLeft: number;
  @ApiProperty({ type: Date, nullable: true }) approvedAt: Date | null;
}

class OngoingCreatorDto {
  @ApiProperty({ format: 'uuid' }) applicationId: string;
  @ApiProperty({ type: Date, nullable: true, description: 'When the business marked them paid' }) paidAt: Date | null;
  @ApiProperty({ description: 'Pieces approved' }) done: number;
  @ApiProperty() total: number;
  @ApiProperty({ description: 'Every piece approved and there is cash to pay' }) canMarkPaid: boolean;
  @ApiProperty({ type: Object, description: 'id, name, avatarUrl, handle, city, platforms, niches' })
  creator: Record<string, unknown>;
  @ApiProperty({ type: [PieceDto] }) pieces: PieceDto[];
}

class OngoingSummaryDto {
  @ApiProperty({ description: 'Approved creators' }) creators: number;
  @ApiProperty() pieces: number;
  @ApiProperty({ description: 'Pieces approved' }) approved: number;
  @ApiProperty() needsReview: number;
  @ApiProperty() late: number;
  @ApiProperty({ description: 'Cash per creator times approved creators' }) cashTotal: number;
  @ApiProperty({ description: 'Cash for creators marked paid' }) cashPaid: number;
}

/** A live campaign as the Ongoing tab shows it. */
export class OngoingCampaignDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() contentTypeName: string;
  @ApiProperty({ example: '2026-10-12' }) contentDue: string;
  @ApiProperty({ type: String, nullable: true }) publishStart: string | null;
  @ApiProperty({ type: String, nullable: true }) publishEnd: string | null;
  @ApiProperty() slots: number;
  @ApiProperty({ type: Number, nullable: true }) cashPerCreator: number | null;
  @ApiProperty() reviewDrafts: boolean;
  @ApiProperty({ type: OngoingSummaryDto }) summary: OngoingSummaryDto;
  @ApiProperty({ type: [OngoingCreatorDto] }) creators: OngoingCreatorDto[];
}
