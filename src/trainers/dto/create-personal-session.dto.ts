import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsUUID } from 'class-validator';

export class CreatePersonalSessionDto {
  @ApiProperty({
    description: 'UUID del entrenador activo',
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
  })
  @IsUUID('all', {
    message: 'El identificador del entrenador debe ser un UUID válido.',
  })
  trainerId!: string;

  @ApiProperty({
    description:
      'Fecha y hora de inicio del espacio de 60 minutos (ISO 8601, con al menos 12 horas de anticipación)',
    example: '2026-11-23T14:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate({ message: 'La fecha y hora de inicio no son válidas.' })
  startsAt!: Date;
}
