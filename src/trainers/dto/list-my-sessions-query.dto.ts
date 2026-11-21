import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PersonalSessionStatus } from '@PrismaClient';

export class ListMySessionsQueryDto {
  @ApiPropertyOptional({ enum: PersonalSessionStatus })
  @IsOptional()
  @IsEnum(PersonalSessionStatus, {
    message: 'El estado debe ser SCHEDULED, CANCELLED o COMPLETED.',
  })
  status?: PersonalSessionStatus;
}
