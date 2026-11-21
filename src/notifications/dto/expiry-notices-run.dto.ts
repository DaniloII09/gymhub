import { ApiProperty } from '@nestjs/swagger';

class ExpiryNoticesSentDto {
  @ApiProperty({ example: 3, description: 'Avisos de 5 días antes.' })
  D5!: number;

  @ApiProperty({ example: 1, description: 'Avisos de 1 día antes.' })
  D1!: number;
}

/** Resultado de una corrida de la tarea de avisos de vencimiento (H26). */
export class ExpiryNoticesRunDto {
  @ApiProperty({ example: '2026-11-18', description: 'Fecha del gimnasio.' })
  date!: string;

  @ApiProperty({ type: ExpiryNoticesSentDto })
  sent!: ExpiryNoticesSentDto;

  @ApiProperty({
    example: true,
    description:
      'false si Membresías (H04) todavía no registra MEMBERSHIP_EXPIRY_SOURCE.',
  })
  sourceAvailable!: boolean;
}
