import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ListClassesQueryDto {
  @ApiPropertyOptional({
    description:
      'Inicio del rango a consultar en formato ISO 8601 (por defecto lunes de la semana actual en UTC)',
    example: '2026-12-01T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha inicial del filtro (from) no es válida.' })
  from?: Date;

  @ApiPropertyOptional({
    description:
      'Fin del rango a consultar en formato ISO 8601 (por defecto 7 días después de from)',
    example: '2026-12-08T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha final del filtro (to) no es válida.' })
  to?: Date;
}
