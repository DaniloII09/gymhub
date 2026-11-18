import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Min } from 'class-validator';

export class ListClassesQueryDto {
  @ApiPropertyOptional({
    description:
      'Inicio del rango a consultar en formato ISO 8601 (ADMIN: lunes de la semana actual en UTC; MEMBER: momento actual)',
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
      'Fin del rango a consultar en formato ISO 8601 (por defecto `days` o 7 días después de from; máximo 7 días para MEMBER)',
    example: '2026-12-08T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha final del filtro (to) no es válida.' })
  to?: Date;

  @ApiPropertyOptional({
    description:
      'Cantidad de días desde from cuando no se envía to (máximo 7 días para MEMBER)',
    example: 7,
    minimum: 1,
    maximum: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de días debe ser un número entero.' })
  @Min(1, { message: 'El rango mínimo a consultar es de 1 día.' })
  days?: number;
}

