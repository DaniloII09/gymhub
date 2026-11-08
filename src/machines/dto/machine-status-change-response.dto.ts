import { ApiProperty } from '@nestjs/swagger';
import { MachineStatus } from '@PrismaClient';
import type { MachineStatusChangeWithAuthor } from '@Machines/repositories';

/**
 * Respuesta de PATCH /machines/{machineId}/status.
 *
 * `changedBy` es el correo del autor porque User todavía no tiene nombre; se
 * cambia por `fullName` cuando H01 agregue los datos de perfil.
 */
export class MachineStatusChangeResponseDto {
  @ApiProperty({ example: 1 })
  machineId!: number;

  @ApiProperty({ enum: MachineStatus })
  status!: MachineStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  changedAt!: Date;

  @ApiProperty({ example: 'admin@gymhub.test' })
  changedBy!: string;

  static fromEntity(
    change: MachineStatusChangeWithAuthor,
  ): MachineStatusChangeResponseDto {
    return {
      machineId: change.machineId,
      status: change.toStatus,
      changedAt: change.changedAt,
      changedBy: change.changedBy.email,
    };
  }
}

/** Una fila del historial de estados de una máquina. */
export class MachineStatusHistoryEntryDto {
  @ApiProperty({ enum: MachineStatus })
  fromStatus!: MachineStatus;

  @ApiProperty({ enum: MachineStatus })
  toStatus!: MachineStatus;

  @ApiProperty({ example: 'Cambio de banda por desgaste' })
  reason!: string;

  @ApiProperty({ example: 'admin@gymhub.test' })
  changedBy!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  changedAt!: Date;

  static fromEntity(
    change: MachineStatusChangeWithAuthor,
  ): MachineStatusHistoryEntryDto {
    return {
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      reason: change.reason,
      changedBy: change.changedBy.email,
      changedAt: change.changedAt,
    };
  }
}

/** Respuesta de GET /machines/{machineId}/status-history. */
export class MachineStatusHistoryDto {
  @ApiProperty({ type: [MachineStatusHistoryEntryDto] })
  data!: MachineStatusHistoryEntryDto[];
}
