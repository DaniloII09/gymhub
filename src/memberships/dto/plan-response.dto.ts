import { ApiProperty } from '@nestjs/swagger';
import { PlanType, type Plan } from '@PrismaClient';

export class PlanResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Mensual' })
  name!: string;

  @ApiProperty({ enum: PlanType })
  type!: PlanType;

  @ApiProperty({ type: Number, nullable: true, example: 30, description: 'null en DROP_IN.' })
  durationDays!: number | null;

  @ApiProperty({ example: 25, description: 'Número con 2 decimales.' })
  price!: number;

  @ApiProperty({ type: String, nullable: true })
  benefits!: string | null;

  @ApiProperty()
  isActive!: boolean;

  static fromEntity(plan: Plan): PlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      type: plan.type,
      durationDays: plan.durationDays,
      // Decimal(8, 2) cabe sin pérdida en un number de JS.
      price: plan.price.toNumber(),
      benefits: plan.benefits,
      isActive: plan.isActive,
    };
  }
}

export class PlanListResponseDto {
  @ApiProperty({ type: [PlanResponseDto] })
  data!: PlanResponseDto[];
}
