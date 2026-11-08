import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@Common/pagination';
import { MachineArea } from '@PrismaClient';

export class ListMachinesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MachineArea, description: 'Filtra por área.' })
  @IsOptional()
  @IsEnum(MachineArea, { message: 'El área no es válida.' })
  area?: MachineArea;
}
