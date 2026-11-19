import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';

export const START_DATE_FORMAT_MESSAGE = 'La fecha de inicio debe tener el formato AAAA-MM-DD.';

/** Cuerpo de POST /memberships (BE-4.1). */
export class CreateMembershipDto {
  @ApiProperty({ format: 'uuid', description: 'Usuario con rol Miembro.' })
  @IsUUID('all', { message: 'El miembro no es válido.' })
  memberId!: string;

  @ApiProperty({ example: 1, description: 'Plan activo Mensual o Trimestral.' })
  @IsInt({ message: 'El plan no es válido.' })
  @Min(1, { message: 'El plan no es válido.' })
  planId!: number;

  @ApiPropertyOptional({
    example: '2026-11-20',
    description:
      'Fecha solo-día, hoy o posterior; por defecto hoy. Si el miembro tiene una membresía activa, se ignora y la nueva inicia el día siguiente a su vencimiento.',
  })
  @IsOptional()
  // El formato se valida aquí; que no sea anterior a hoy lo revisa el
  // servicio, porque "hoy" es la fecha del gimnasio.
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: START_DATE_FORMAT_MESSAGE })
  startDate?: string;
}
