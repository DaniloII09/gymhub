import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChargeStatus, PersonalSessionOutcome, PersonalSessionStatus } from '@PrismaClient';
import type { PersonalSessionWithDetails } from '@Trainers/repositories';
import { TrainerSummaryDto } from './trainer-summary.dto.js';

export class PersonalSessionResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  trainerId!: string;

  @ApiProperty({ type: TrainerSummaryDto })
  trainer!: TrainerSummaryDto;

  @ApiProperty({ example: '22222222-2222-4222-8222-222222222222' })
  memberId!: string;

  @ApiPropertyOptional({
    example: 'a0000000-0000-4000-8000-000000000001',
    nullable: true,
  })
  availabilityBlockId!: string | null;

  @ApiProperty({ example: '2026-11-23T14:00:00.000Z' })
  startsAt!: Date;

  @ApiProperty({ example: '2026-11-23T15:00:00.000Z' })
  endsAt!: Date;

  @ApiPropertyOptional({ example: 15, nullable: true })
  price!: number | null;

  @ApiPropertyOptional({ example: 42, nullable: true })
  chargeId!: number | null;

  @ApiPropertyOptional({
    enum: ChargeStatus,
    example: ChargeStatus.PENDING,
    nullable: true,
  })
  chargeStatus!: ChargeStatus | null;

  @ApiProperty({
    enum: PersonalSessionStatus,
    example: PersonalSessionStatus.SCHEDULED,
  })
  status!: PersonalSessionStatus;

  @ApiPropertyOptional({ enum: PersonalSessionOutcome, nullable: true })
  outcome!: PersonalSessionOutcome | null;

  @ApiPropertyOptional({ nullable: true })
  resultRecordedAt!: Date | null;

  @ApiProperty({ example: '2026-11-18T05:00:00.000Z' })
  createdAt!: Date;

  static fromEntity(
    entity: PersonalSessionWithDetails,
  ): PersonalSessionResponseDto {
    return {
      id: entity.id,
      trainerId: entity.trainerId,
      trainer: {
        id: entity.trainer.id,
        fullName: entity.trainer.fullName,
        email: entity.trainer.email,
      },
      memberId: entity.memberId,
      availabilityBlockId: entity.availabilityBlockId,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      price: entity.price !== null ? Number(entity.price) : null,
      chargeId: entity.chargeId,
      chargeStatus: entity.chargeStatus,
      status: entity.status,
      outcome: entity.outcome,
      resultRecordedAt: entity.resultRecordedAt,
      createdAt: entity.createdAt,
    };
  }
}

export class PersonalSessionListDto {
  @ApiProperty({ type: [PersonalSessionResponseDto] })
  data!: PersonalSessionResponseDto[];
}
