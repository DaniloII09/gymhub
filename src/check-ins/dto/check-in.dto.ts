import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { MembershipStatus } from '@Common/contracts';

export const LOOKUP_LENGTH_MESSAGE = 'Escribe entre 2 y 100 caracteres para buscar.';
export const EXCEPTION_REASON_MIN = 5;
export const EXCEPTION_REASON_MAX = 200;
export const EXCEPTION_REASON_LENGTH_MESSAGE = `El motivo debe tener entre ${EXCEPTION_REASON_MIN} y ${EXCEPTION_REASON_MAX} caracteres.`;
const STATUSES: MembershipStatus[] = ['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'NONE'];

/** Query de GET /check-ins/lookup (BE-13.1). */
export class CheckInLookupQueryDto {
  @ApiProperty({ example: 'GYM-000001', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: LOOKUP_LENGTH_MESSAGE })
  @Length(2, 100, { message: LOOKUP_LENGTH_MESSAGE })
  q!: string;
}

/** Un miembro encontrado en el check-in, con el estado de su membresía. */
export class CheckInLookupItemDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'GYM-000001' })
  memberCode!: string;

  @ApiProperty({ example: 'Juan Perez' })
  fullName!: string;

  @ApiProperty({ enum: STATUSES, example: 'ACTIVE' })
  membershipStatus!: MembershipStatus;

  @ApiProperty({
    description:
      'H14: true solo con membresía Activa (incluida una clase suelta de hoy). Si es false, el ingreso exige exceptionReason.',
  })
  accessAllowed!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-12-08',
    description:
      'AAAA-MM-DD: vencimiento de la membresía actual (la próxima fecha de pago); null sin membresía.',
  })
  nextPaymentDate!: string | null;
}

export class CheckInLookupResponseDto {
  @ApiProperty({ type: [CheckInLookupItemDto], description: 'Máximo 10, ordenados por nombre.' })
  data!: CheckInLookupItemDto[];
}

/** Cuerpo de POST /check-ins (BE-13.1). */
export class CreateCheckInDto {
  @ApiProperty({ format: 'uuid', description: 'Usuario con rol Miembro.' })
  @IsUUID('all', { message: 'El miembro no es válido.' })
  memberId!: string;

  @ApiPropertyOptional({
    minLength: EXCEPTION_REASON_MIN,
    maxLength: EXCEPTION_REASON_MAX,
    example: 'Renueva el viernes; el gerente autorizó el ingreso.',
    description:
      'H14: obligatorio si la membresía no está Activa; se guarda con el ingreso. Con membresía Activa se ignora.',
  })
  // Se recorta antes de validar; vacío cuenta como "sin motivo".
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsOptional()
  @IsString({ message: EXCEPTION_REASON_LENGTH_MESSAGE })
  @Length(EXCEPTION_REASON_MIN, EXCEPTION_REASON_MAX, { message: EXCEPTION_REASON_LENGTH_MESSAGE })
  exceptionReason?: string;
}

/** Respuesta 201 de POST /check-ins. */
export class CheckInResponseDto {
  @ApiProperty({ example: 21 })
  checkInId!: number;

  @ApiProperty({ example: 'GYM-000001' })
  memberCode!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Hora del servidor.' })
  checkedInAt!: Date;

  @ApiProperty({ enum: STATUSES, description: 'Estado de la membresía al momento del ingreso.' })
  membershipStatus!: MembershipStatus;

  @ApiProperty()
  isException!: boolean;
}
