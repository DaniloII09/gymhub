import { ApiProperty } from '@nestjs/swagger';
import { MachineArea, MachineStatus } from '@PrismaClient';
import type { MachineAvailability } from '@Machines/repositories';

/**
 * Lo que ve cualquier usuario de una máquina. A propósito no lleva el id
 * interno, el motivo ni el autor del último cambio.
 */
export class MachineAvailabilityDto {
  @ApiProperty({ example: 'Caminadora 1' })
  name!: string;

  @ApiProperty({ enum: MachineArea })
  area!: MachineArea;

  @ApiProperty({ enum: MachineStatus })
  status!: MachineStatus;

  static fromEntity(machine: MachineAvailability): MachineAvailabilityDto {
    return { name: machine.name, area: machine.area, status: machine.status };
  }
}

/** Respuesta de GET /machines/availability. */
export class MachineAvailabilityListDto {
  @ApiProperty({ type: [MachineAvailabilityDto] })
  data!: MachineAvailabilityDto[];
}
