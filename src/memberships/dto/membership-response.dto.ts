import { ApiProperty } from '@nestjs/swagger';
import { MembershipStatus, PlanType, type Membership, type Plan } from '@PrismaClient';
import { fromDbDate } from '../services/membership-dates.js';

/** Respuesta 201 de POST /memberships (BE-4.1). */
export class MembershipCreatedDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'Mensual', description: 'Nombre del plan vendido.' })
  plan!: string;

  @ApiProperty({ enum: PlanType })
  planType!: PlanType;

  @ApiProperty({ example: '2026-11-10', description: 'AAAA-MM-DD' })
  startDate!: string;

  @ApiProperty({ example: '2026-12-09', description: 'AAAA-MM-DD, último día con acceso.' })
  endDate!: string;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.PENDING_PAYMENT })
  status!: MembershipStatus;

  @ApiProperty()
  isRenewal!: boolean;

  @ApiProperty({ example: 34, description: 'Cobro PENDING creado en Pagos.' })
  chargeId!: number;

  @ApiProperty({ example: 25, description: 'Monto del cobro: el precio del plan.' })
  amount!: number;

  static from(membership: Membership, plan: Plan, chargeId: number): MembershipCreatedDto {
    return {
      id: membership.id,
      plan: plan.name,
      planType: membership.planType,
      startDate: fromDbDate(membership.startDate),
      endDate: fromDbDate(membership.endDate),
      status: membership.status,
      isRenewal: membership.isRenewal,
      chargeId,
      amount: plan.price.toNumber(),
    };
  }
}
