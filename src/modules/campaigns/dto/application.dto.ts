import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApplicationStatus, SocialPlatform } from '../../../generated/prisma/enums.js';

/** A creator asking to join a live campaign. */
export class ApplyDto {
  @ApiPropertyOptional({ maxLength: 300, description: 'A short message to the business' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ example: 'Sat 12 PM', description: "One of the campaign's visitTimes; required when it has some" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  visitTime?: string;
}

class ApplicantDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Without the "@"' }) handle: string | null;
  @ApiProperty({ type: String, nullable: true }) city: string | null;
  @ApiProperty({ enum: SocialPlatform, isArray: true }) platforms: SocialPlatform[];
  @ApiProperty({ type: [String] }) niches: string[];
}

export class ApplicationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ApplicationStatus }) status: ApplicationStatus;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Visit time the creator picked' }) visitTime: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: Date, nullable: true }) decidedAt: Date | null;
  @ApiProperty({ type: ApplicantDto }) creator: ApplicantDto;
}

/** Everything the campaign screen needs about who applied. */
export class ApplicationsDto {
  @ApiProperty() slots: number;
  @ApiProperty({ description: 'Approved creators (slots taken)' }) approved: number;
  @ApiProperty({ description: 'Waiting for a decision' }) pending: number;
  @ApiProperty({ type: [ApplicationDto], description: 'Waiting first, then approved, then declined; oldest first' })
  applications: ApplicationDto[];
}
