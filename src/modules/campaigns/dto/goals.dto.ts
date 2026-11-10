import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';

/** A whole-number range, e.g. 10,000 to 50,000 impressions. Either end may be left out. */
export class CountRangeDto {
  @ApiPropertyOptional({ minimum: 0, example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  min?: number;

  @ApiPropertyOptional({ minimum: 0, example: 50000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  max?: number;
}

/** Pesos with centavos, e.g. a cost per click of 2.50 to 5. */
export class MoneyRangeDto {
  @ApiPropertyOptional({ minimum: 0, example: 2.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  min?: number;

  @ApiPropertyOptional({ minimum: 0, example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  max?: number;
}

/** A percentage from 0 to 100, e.g. a click-through rate of 1.5 to 3. */
export class PercentRangeDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 1.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  min?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 3 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  max?: number;
}

/** Optional performance targets for the whole campaign. */
export class CampaignGoalsDto {
  @ApiPropertyOptional({ type: CountRangeDto, description: 'Times the content is shown' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CountRangeDto)
  impressions?: CountRangeDto;

  @ApiPropertyOptional({ type: CountRangeDto, description: 'Different people who see it' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CountRangeDto)
  reach?: CountRangeDto;

  @ApiPropertyOptional({ type: CountRangeDto, description: 'Taps on the link' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CountRangeDto)
  clicks?: CountRangeDto;

  @ApiPropertyOptional({ type: MoneyRangeDto, description: 'Cost per click, in pesos' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyRangeDto)
  cpc?: MoneyRangeDto;

  @ApiPropertyOptional({ type: PercentRangeDto, description: 'Click-through rate: clicks per 100 impressions' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PercentRangeDto)
  ctr?: PercentRangeDto;

  @ApiPropertyOptional({ type: CountRangeDto, description: 'Purchases, bookings or sign-ups' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CountRangeDto)
  conversions?: CountRangeDto;
}
