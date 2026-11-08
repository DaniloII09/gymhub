import { ApiProperty } from '@nestjs/swagger';
import { ClassStatus } from '@PrismaClient';
import type { GymClassWithDetails } from '@Classes/repositories';

export class ClassTrainerSummaryDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  fullName!: string;

  @ApiProperty({ example: 'entrenador@gymhub.test' })
  email!: string;
}

export class ClassResponseDto {
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

  @ApiProperty({
    description: 'Cantidad actual de reservas confirmadas en la clase',
    example: 0,
  })
  confirmedReservations!: number;

  @ApiProperty({ enum: ClassStatus, example: ClassStatus.SCHEDULED })
  status!: ClassStatus;

  @ApiProperty({ example: '2026-11-08T20:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-08T20:00:00.000Z' })
  updatedAt!: Date;

  static fromEntity(entity: GymClassWithDetails): ClassResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      trainerId: entity.trainerId,
      trainer: {
        id: entity.trainer.id,
        fullName: entity.trainer.fullName,
        email: entity.trainer.email,
      },
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      capacity: entity.capacity,
      confirmedReservations: entity.confirmedReservations,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
