import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MachineArea, MachineStatus } from '@PrismaClient';

/** Filtros opcionales de la consulta pública de máquinas (H21). */
export class MachineAvailabilityQueryDto {
  @ApiPropertyOptional({ enum: MachineArea, description: 'Filtra por área.' })
  @IsOptional()
  @IsEnum(MachineArea, { message: 'El área no es válida.' })
  area?: MachineArea;

  @ApiPropertyOptional({
    enum: MachineStatus,
    description: 'Filtra por estado.',
  })
  @IsOptional()
  @IsEnum(MachineStatus, { message: 'El estado no es válido.' })
  status?: MachineStatus;
}
