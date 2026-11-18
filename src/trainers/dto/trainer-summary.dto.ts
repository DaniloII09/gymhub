import { ApiProperty } from '@nestjs/swagger';

export class TrainerSummaryDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 'Entrenador Demo' })
  fullName!: string;

  @ApiProperty({ example: 'entrenador@gymhub.test' })
  email!: string;
}

export class TrainerListDto {
  @ApiProperty({ type: [TrainerSummaryDto] })
  data!: TrainerSummaryDto[];
}
