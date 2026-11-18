import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReservationStatus } from '@PrismaClient';

export class ListMyReservationsQueryDto {
  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus, {
    message: 'El estado debe ser CONFIRMED o CANCELLED.',
  })
  status?: ReservationStatus;
}
