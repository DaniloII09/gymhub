import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassStatus, ReservationStatus } from '@PrismaClient';
import type { ClassReservationWithClass } from '@Classes/repositories';
import { ClassTrainerSummaryDto } from './class-response.dto.js';

export class ReservationClassSummaryDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Spinning Matutino' })
  name!: string;

  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  trainerId!: string;

  @ApiProperty({ type: ClassTrainerSummaryDto })
  trainer!: ClassTrainerSummaryDto;

  @ApiProperty({ example: '2026-12-01T18:00:00.000Z' })
  startsAt!: Date;

  @ApiProperty({ example: '2026-12-01T18:50:00.000Z' })
  endsAt!: Date;

  @ApiProperty({ example: 20 })
  capacity!: number;

  @ApiProperty({ example: 18 })
  confirmedReservations!: number;

  @ApiProperty({ example: 2 })
  spotsLeft!: number;

  @ApiProperty({ enum: ClassStatus, example: ClassStatus.SCHEDULED })
  status!: ClassStatus;
}

export class ClassReservationResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  classId!: number;

  @ApiProperty({ example: '22222222-2222-4222-8222-222222222222' })
  memberId!: string;

  @ApiProperty({
    enum: ReservationStatus,
    example: ReservationStatus.CONFIRMED,
  })
  status!: ReservationStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({
    example: false,
    description: 'La reserva fue cancelada por el gimnasio.',
  })
  cancelledByGym!: boolean;

  @ApiProperty({ example: '2026-11-18T05:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: ReservationClassSummaryDto })
  gymClass!: ReservationClassSummaryDto;

  static fromEntity(
    entity: ClassReservationWithClass,
  ): ClassReservationResponseDto {
    return {
      id: entity.id,
      classId: entity.classId,
      memberId: entity.memberId,
      status: entity.status,
      cancelledAt: entity.cancelledAt,
      cancelledByGym: entity.cancelledByGym,
      createdAt: entity.createdAt,
      gymClass: {
        id: entity.gymClass.id,
        name: entity.gymClass.name,
        trainerId: entity.gymClass.trainerId,
        trainer: {
          id: entity.gymClass.trainer.id,
          fullName: entity.gymClass.trainer.fullName,
          email: entity.gymClass.trainer.email,
        },
        startsAt: entity.gymClass.startsAt,
        endsAt: entity.gymClass.endsAt,
        capacity: entity.gymClass.capacity,
        confirmedReservations: entity.gymClass.confirmedReservations,
        spotsLeft: Math.max(
          0,
          entity.gymClass.capacity - entity.gymClass.confirmedReservations,
        ),
        status: entity.gymClass.status,
      },
    };
  }
}

export class MemberReservationListDto {
  @ApiProperty({ type: [ClassReservationResponseDto] })
  data!: ClassReservationResponseDto[];
}
