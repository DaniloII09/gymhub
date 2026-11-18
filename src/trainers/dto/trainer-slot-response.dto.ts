import { ApiProperty } from '@nestjs/swagger';
import { TrainerSummaryDto } from './trainer-summary.dto.js';

export class TrainerSlotDto {
  @ApiProperty({ example: 'a0000000-0000-4000-8000-000000000001' })
  availabilityBlockId!: string;

  @ApiProperty({
    example: '2026-11-23',
    description: 'Fecha en la zona horaria del gimnasio (America/El_Salvador)',
  })
  date!: string;

  @ApiProperty({
    example: '08:00',
    description: 'Hora de inicio en la zona horaria del gimnasio (HH:mm)',
  })
  startTime!: string;

  @ApiProperty({
    example: '09:00',
    description: 'Hora de fin en la zona horaria del gimnasio (HH:mm)',
  })
  endTime!: string;

  @ApiProperty({ example: '2026-11-23T14:00:00.000Z' })
  startsAt!: string;

  @ApiProperty({ example: '2026-11-23T15:00:00.000Z' })
  endsAt!: string;
}

export class TrainerSlotsResponseDto {
  @ApiProperty({ type: TrainerSummaryDto })
  trainer!: TrainerSummaryDto;

  @ApiProperty({ example: '2026-11-18T05:00:00.000Z' })
  from!: Date;

  @ApiProperty({ example: '2026-12-02T05:00:00.000Z' })
  to!: Date;

  @ApiProperty({ type: [TrainerSlotDto] })
  slots!: TrainerSlotDto[];
}
