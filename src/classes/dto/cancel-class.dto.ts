import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CancelClassDto {
  @ApiProperty({ minLength: 5, maxLength: 200, example: 'El entrenador no estará disponible.' })
  @IsString()
  @Length(5, 200)
  reason!: string;
}

export class CancelClassResponseDto {
  @ApiProperty({ example: 14 })
  reservationsCancelled!: number;

  @ApiProperty({ example: 14 })
  noticesSent!: number;
}
