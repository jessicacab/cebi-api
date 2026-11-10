import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

/** Social handles. Send "" to remove one. */
export class SocialsDto {
  @ApiPropertyOptional({ example: '@lolanenacebu' }) @IsOptional() @IsString() @MaxLength(200) tiktok?: string;
  @ApiPropertyOptional({ example: "Lola Nena's Lechon House" }) @IsOptional() @IsString() @MaxLength(200) facebook?: string;
  @ApiPropertyOptional({ example: '@lolanenas.cebu' }) @IsOptional() @IsString() @MaxLength(200) instagram?: string;
  @ApiPropertyOptional({ example: '@lolanenaskitchen' }) @IsOptional() @IsString() @MaxLength(200) youtube?: string;
}

/** Fields of the business profile. Leave a field out to keep it; send "" to clear an optional one. */
export class UpdateBusinessProfileDto {
  @ApiPropertyOptional({ description: 'Business name (shown everywhere)', example: "Lola Nena's Lechon House" })
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @ApiPropertyOptional({ example: 'Nena' }) @IsOptional() @IsString() @MaxLength(60) ownerFirstName?: string;
  @ApiPropertyOptional({ example: 'Santos' }) @IsOptional() @IsString() @MaxLength(60) ownerLastName?: string;
  @ApiPropertyOptional({ example: '+63 917 555 0142' }) @IsOptional() @IsString() @MaxLength(30) contactMobile?: string;
  @ApiPropertyOptional({ example: 'hello@lolanenas.ph' })
  @IsOptional() @ValidateIf((o: UpdateBusinessProfileDto) => !!o.contactEmail?.trim()) @IsEmail() @MaxLength(254) contactEmail?: string;
  @ApiPropertyOptional({ example: '(032) 345 6789' }) @IsOptional() @IsString() @MaxLength(30) landline?: string;
  @ApiPropertyOptional({ example: '128 Gov. M. Cuenco Ave.' }) @IsOptional() @IsString() @MaxLength(120) street?: string;
  @ApiPropertyOptional({ example: 'Talamban' }) @IsOptional() @IsString() @MaxLength(80) barangay?: string;
  @ApiPropertyOptional({ description: 'Used to match nearby creators', example: 'Cebu City' }) @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional({ example: 'Across Talamban Barangay Hall, blue gate' }) @IsOptional() @IsString() @MaxLength(160) landmark?: string;
  @ApiPropertyOptional({ example: 10.3533, nullable: true }) @IsOptional() @IsLatitude() latitude?: number | null;
  @ApiPropertyOptional({ example: 123.9118, nullable: true }) @IsOptional() @IsLongitude() longitude?: number | null;
  @ApiPropertyOptional({ type: SocialsDto }) @IsOptional() @ValidateNested() @Type(() => SocialsDto) socials?: SocialsDto;
}
