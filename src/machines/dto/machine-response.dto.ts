import { ApiProperty } from '@nestjs/swagger';
import { MachineArea, MachineStatus, type Machine } from '@PrismaClient';

/** Fila del inventario que ve el administrador. */
export class MachineResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'CAR-001' })
  code!: string;

  @ApiProperty({ example: 'Caminadora 1' })
  name!: string;

  @ApiProperty({ enum: MachineArea })
  area!: MachineArea;

  @ApiProperty({ enum: MachineStatus })
  status!: MachineStatus;

  static fromEntity(machine: Machine): MachineResponseDto {
    return {
      id: machine.id,
      code: machine.code,
      name: machine.name,
      area: machine.area,
      status: machine.status,
    };
  }
}

/** Página del inventario, con la forma de `Paginated<T>`. */
export class MachinePageDto {
  @ApiProperty({ type: [MachineResponseDto] })
  data!: MachineResponseDto[];

  @ApiProperty({ example: 8 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}
