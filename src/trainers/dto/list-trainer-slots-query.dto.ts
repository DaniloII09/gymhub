import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Min } from 'class-validator';

export class ListTrainerSlotsQueryDto {
  @ApiPropertyOptional({
    description: 'Inicio del rango a consultar en formato ISO 8601 (por defecto momento actual)',
    example: '2026-11-18T00:00:00-06:00',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha inicial del filtro (from) no es válida.' })
  from?: Date;

  @ApiPropertyOptional({
    description:
      'Fin del rango a consultar en formato ISO 8601 (máximo 14 días desde from)',
    example: '2026-12-02T00:00:00-06:00',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha final del filtro (to) no es válida.' })
  to?: Date;

  @ApiPropertyOptional({
    description: 'Cantidad de días desde from cuando no se envía to (entre 1 y 14)',
    example: 14,
    minimum: 1,
    maximum: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de días debe ser un número entero.' })
  @Min(1, { message: 'El rango mínimo a consultar es de 1 día.' })
  days?: number;
}
