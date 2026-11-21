import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ListTrainerSlotsQueryDto,
  TrainerListDto,
  TrainerSlotsResponseDto,
} from '@Trainers/dto';
import { PersonalSessionsService } from '@Trainers/services';

/**
 * Consulta de entrenadores activos y sus espacios libres de 60 minutos (H11 / BE-11.1).
 */
@ApiTags('trainers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('trainers')
export class TrainersController {
  constructor(private readonly sessionsService: PersonalSessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los entrenadores activos disponibles para sesiones personales',
  })
  @ApiOkResponse({ type: TrainerListDto })
  async listActive(): Promise<TrainerListDto> {
    const data = await this.sessionsService.listActiveTrainers();
    return { data };
  }

  @Get(':trainerId/slots')
  @ApiOperation({
    summary:
      'Lista espacios libres de 60 minutos de un entrenador (máximo 14 días, BE-11.1)',
    description:
      'Genera bloques de 60 min desde la disponibilidad recurrente (H10) en zona horaria America/El_Salvador, excluyendo fragmentos menores, sesiones SCHEDULED y clases grupales SCHEDULED.',
  })
  @ApiOkResponse({ type: TrainerSlotsResponseDto })
  @ApiBadRequestResponse({
    description:
      'Rango superior a 14 días (ej. 15 días), fechas inválidas o usuario sin rol TRAINER.',
  })
  @ApiNotFoundResponse({ description: 'El entrenador no existe.' })
  async listSlots(
    @Param('trainerId', new ParseUUIDPipe()) trainerId: string,
    @Query() query: ListTrainerSlotsQueryDto,
  ): Promise<TrainerSlotsResponseDto> {
    const result = await this.sessionsService.listAvailableSlots(
      trainerId,
      query,
    );
    return {
      trainer: result.trainer,
      from: result.from,
      to: result.to,
      slots: result.slots.map((slot) => ({
        availabilityBlockId: slot.availabilityBlockId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }
}
