import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
  CreateRoutineDto,
  RoutineListDto,
  RoutineResponseDto,
  UpdateRoutineDto,
} from '@Routines/dto';
import { RoutinesService } from '@Routines/services';
import type { User } from '@PrismaClient';

/** Rutinas personalizadas de entrenamiento (H18). */
@ApiTags('routines')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  @Roles('MEMBER')
  @Get('me')
  @ApiOperation({
    summary: 'Lista las rutinas asignadas al miembro autenticado (BE-18.1)',
  })
  @ApiOkResponse({ type: RoutineListDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
  async listMine(@CurrentUser() user: User): Promise<RoutineListDto> {
    return { data: await this.routinesService.listMine(user.id) };
  }

  @Roles('TRAINER')
  @Get('trainer/me')
  @ApiOperation({
    summary: 'Lista las rutinas creadas por el entrenador autenticado',
  })
  @ApiOkResponse({ type: RoutineListDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Entrenador.' })
  async listTrainerRoutines(
    @CurrentUser() user: User,
  ): Promise<RoutineListDto> {
    return { data: await this.routinesService.listByTrainer(user.id) };
  }

  @Roles('TRAINER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea una rutina y la asigna a un miembro (solo Entrenador, BE-18.1)',
  })
  @ApiCreatedResponse({ type: RoutineResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de rutina o ejercicios fuera de rango.' })
  @ApiForbiddenResponse({ description: 'El usuario no es Entrenador.' })
  @ApiNotFoundResponse({ description: 'No encontramos ese miembro.' })
  create(
    @Body() dto: CreateRoutineDto,
    @CurrentUser() user: User,
  ): Promise<RoutineResponseDto> {
    return this.routinesService.create(user.id, dto);
  }

  @Roles('TRAINER')
  @Patch(':routineId')
  @ApiOperation({
    summary: 'Edita una rutina propia del entrenador autenticado (BE-18.1)',
  })
  @ApiOkResponse({ type: RoutineResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos o cuerpo vacío.' })
  @ApiForbiddenResponse({
    description: 'El usuario no es Entrenador o la rutina pertenece a otro entrenador.',
  })
  @ApiNotFoundResponse({ description: 'La rutina o el miembro no existen.' })
  update(
    @Param('routineId', ParseIntPipe) routineId: number,
    @Body() dto: UpdateRoutineDto,
    @CurrentUser() user: User,
  ): Promise<RoutineResponseDto> {
    return this.routinesService.update(routineId, user.id, dto);
  }

  @Roles('TRAINER')
  @Delete(':routineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina una rutina propia y en cascada sus ejercicios',
  })
  @ApiNoContentResponse({ description: 'Rutina eliminada.' })
  @ApiForbiddenResponse({
    description: 'El usuario no es Entrenador o la rutina pertenece a otro entrenador.',
  })
  @ApiNotFoundResponse({ description: 'La rutina no existe.' })
  remove(
    @Param('routineId', ParseIntPipe) routineId: number,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.routinesService.remove(routineId, user.id);
  }
}
