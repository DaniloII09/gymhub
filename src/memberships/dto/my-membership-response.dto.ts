import { ApiProperty } from '@nestjs/swagger';
import type {
  CurrentMembership,
  MembershipStatus,
  PlanType,
} from '@Common/contracts';

const STATUSES: MembershipStatus[] = [
  'ACTIVE',
  'PENDING_PAYMENT',
  'EXPIRED',
  'NONE',
];
const PLAN_TYPES: PlanType[] = ['MONTHLY', 'QUARTERLY', 'DROP_IN'];

/**
 * El vencimiento se muestra como fecha del gimnasio (El Salvador), no de UTC:
 * un plan que vence a las 11 p. m. del 15 sigue venciendo el 15, aunque en UTC
 * ya sea el 16. en-CA formatea como AAAA-MM-DD.
 */
const GYM_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Clase que incluye una clase suelta (H05). */
export class IncludedClassDto {
  @ApiProperty({ example: 'Spinning Matutino' })
  name!: string;

  @ApiProperty({ example: '2026-11-18T13:00:00.000Z' })
  startsAt!: Date;
}

/** "Mi membresía" del miembro que hace la solicitud (BE-5.1 / H05). */
export class MyMembershipResponseDto {
  @ApiProperty({ enum: STATUSES, example: 'ACTIVE' })
  status!: MembershipStatus;

  @ApiProperty({ nullable: true, example: 'Mensual' })
  planName!: string | null;

  @ApiProperty({ enum: PLAN_TYPES, nullable: true, example: 'MONTHLY' })
  planType!: PlanType | null;

  @ApiProperty({
    nullable: true,
    example: '2026-12-15',
    description: 'Fecha de vencimiento (AAAA-MM-DD, hora de El Salvador).',
  })
  endDate!: string | null;

  @ApiProperty({ nullable: true, example: 12 })
  daysLeft!: number | null;

  @ApiProperty({ type: IncludedClassDto, nullable: true })
  includedClass!: IncludedClassDto | null;

  static fromContract(current: CurrentMembership): MyMembershipResponseDto {
    return {
      status: current.status,
      planName: current.planName,
      planType: current.planType,
      endDate: current.endDate ? GYM_DATE.format(current.endDate) : null,
      daysLeft: current.daysLeft,
      includedClass: current.includedClass ?? null,
    };
  }
}
