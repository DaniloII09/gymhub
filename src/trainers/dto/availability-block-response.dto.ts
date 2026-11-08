import { ApiProperty } from '@nestjs/swagger';
import type { AvailabilityBlock } from '@PrismaClient';

export class AvailabilityBlockResponseDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'b0000000-0000-0000-0000-000000000002' })
  userId!: string;

  @ApiProperty({ example: 1, description: '1 (Lunes) a 7 (Domingo)' })
  weekday!: number;

  @ApiProperty({ example: '08:00' })
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  endTime!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(block: AvailabilityBlock): AvailabilityBlockResponseDto {
    return {
      id: block.id,
      userId: block.userId,
      weekday: block.weekday,
      startTime: block.startTime,
      endTime: block.endTime,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    };
  }
}
