import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ChargeStatus, PersonalSessionOutcome } from '@PrismaClient';
import type { TrainerSessionWithDetails } from '@Trainers/repositories';

export class MarkTrainerResultDto {
  @ApiProperty({ enum: PersonalSessionOutcome })
  @IsEnum(PersonalSessionOutcome)
  outcome!: PersonalSessionOutcome;
}

export class TrainerSessionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() startsAt!: Date;
  @ApiProperty() endsAt!: Date;
  @ApiProperty() member!: { id: string; fullName: string; email: string };
  @ApiPropertyOptional({ enum: ChargeStatus, nullable: true })
  chargeStatus!: ChargeStatus | null;
  @ApiProperty({ enum: ['SCHEDULED', 'COMPLETED'] })
  status!: string;
  @ApiPropertyOptional({ enum: PersonalSessionOutcome, nullable: true })
  outcome!: PersonalSessionOutcome | null;
  @ApiPropertyOptional({ nullable: true })
  resultRecordedAt!: Date | null;

  static fromEntity(entity: TrainerSessionWithDetails): TrainerSessionResponseDto {
    return {
      id: entity.id,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      member: entity.member,
      chargeStatus: entity.chargeStatus,
      status: entity.status,
      outcome: entity.outcome,
      resultRecordedAt: entity.resultRecordedAt,
    };
  }
}

export class TrainerSessionListDto {
  @ApiProperty({ type: [TrainerSessionResponseDto] })
  data!: TrainerSessionResponseDto[];
}
