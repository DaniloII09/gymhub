import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query de paginación compartida por TODOS los listados (H06, H19, H23, ...).
 * `@Type(() => Number)` convierte los query params (que llegan string) a número
 * para que las validaciones apliquen; el ValidationPipe global tiene transform.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // H06: pageSize mayor a 100 retorna 400.
  @Max(100)
  pageSize: number = 20;
}
