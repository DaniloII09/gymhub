import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MachinesService } from '@Machines/services';
import {
  ChangeMachineStatusDto,
  ListMachinesQueryDto,
  MachinePageDto,
  MachineResponseDto,
  MachineStatusChangeResponseDto,
  MachineStatusHistoryDto,
  MachineStatusHistoryEntryDto,
} from '@Machines/dto';
import type { User } from '@PrismaClient';

/**
 * Inventario y mantenimiento de máquinas (H20). Todo es solo para
 * Administrador; por eso @Roles va en cada ruta y no en la clase: la consulta
 * pública de disponibilidad (H21) vive en este mismo controlador.
 */
@ApiTags('machines')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'Lista el inventario de máquinas (Administrador)' })
  @ApiOkResponse({ type: MachinePageDto })
  @ApiBadRequestResponse({ description: 'Área o paginación no válidas.' })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  async list(@Query() query: ListMachinesQueryDto): Promise<MachinePageDto> {
    const page = await this.machinesService.list(query);
    return {
      ...page,
      data: page.data.map((machine) => MachineResponseDto.fromEntity(machine)),
    };
  }

  @Roles('ADMIN')
  @Patch(':machineId/status')
  @ApiOperation({
    summary: 'Cambia el estado de una máquina y lo registra en su historial',
  })
  @ApiOkResponse({ type: MachineStatusChangeResponseDto })
  @ApiBadRequestResponse({
    description: 'Estado no válido o motivo fuera de 5 a 200 caracteres.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({ description: 'La máquina no existe.' })
  @ApiConflictResponse({ description: 'La máquina ya está en ese estado.' })
  async changeStatus(
    @Param('machineId', ParseIntPipe) machineId: number,
    @Body() dto: ChangeMachineStatusDto,
    @CurrentUser() user: User,
  ): Promise<MachineStatusChangeResponseDto> {
    const change = await this.machinesService.changeStatus(
      machineId,
      dto,
      user.id,
    );
    return MachineStatusChangeResponseDto.fromEntity(change);
  }

  @Roles('ADMIN')
  @Get(':machineId/status-history')
  @ApiOperation({
    summary:
      'Historial de estados de una máquina, del más reciente al más antiguo',
  })
  @ApiOkResponse({ type: MachineStatusHistoryDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({ description: 'La máquina no existe.' })
  async history(
    @Param('machineId', ParseIntPipe) machineId: number,
  ): Promise<MachineStatusHistoryDto> {
    const changes = await this.machinesService.history(machineId);
    return {
      data: changes.map((change) =>
        MachineStatusHistoryEntryDto.fromEntity(change),
      ),
    };
  }
}
