import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  get skip() {
    return (this.page - 1) * this.pageSize;
  }
}

/** Return this from a handler to get `{ data: items, meta }` in the response. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly pageSize: number,
  ) {}

  get meta() {
    return {
      total: this.total,
      page: this.page,
      pageSize: this.pageSize,
      totalPages: Math.ceil(this.total / this.pageSize),
    };
  }
}
