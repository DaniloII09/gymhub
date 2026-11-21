import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, ValidateBy, type ValidationOptions } from 'class-validator';
import { MachineStatus } from '@PrismaClient';

export const REASON_MIN_LENGTH = 5;
export const REASON_MAX_LENGTH = 200;
export const MISSING_REASON_MESSAGE = 'Escribe el motivo del cambio.';
export const REASON_LENGTH_MESSAGE = `El motivo debe tener entre ${REASON_MIN_LENGTH} y ${REASON_MAX_LENGTH} caracteres.`;

/**
 * Valida el motivo con un solo mensaje: "Escribe el motivo del cambio." si
 * falta o está vacío, o el de longitud si es muy corto o muy largo. Con
 * IsString + IsNotEmpty + Length por separado, un motivo ausente devolvería
 * los tres mensajes a la vez.
 */
function IsReason(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isReason',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length >= REASON_MIN_LENGTH &&
          value.length <= REASON_MAX_LENGTH,
        defaultMessage: (args) =>
          typeof args?.value === 'string' && args.value.length > 0
            ? REASON_LENGTH_MESSAGE
            : MISSING_REASON_MESSAGE,
      },
    },
    options,
  );
}

export class ChangeMachineStatusDto {
  @ApiProperty({
    enum: MachineStatus,
    example: MachineStatus.UNDER_MAINTENANCE,
  })
  @IsEnum(MachineStatus, { message: 'El estado no es válido.' })
  status!: MachineStatus;

  @ApiProperty({
    description:
      'Motivo del cambio. Se guarda sin espacios al inicio ni al final.',
    example: 'Cambio de banda por desgaste',
    minLength: REASON_MIN_LENGTH,
    maxLength: REASON_MAX_LENGTH,
  })
  // Se recorta antes de validar: un motivo de puros espacios cuenta como vacío.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsReason()
  reason!: string;
}
