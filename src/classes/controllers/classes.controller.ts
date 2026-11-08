import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import {
  ClassResponseDto,
  CreateClassDto,
  UpdateClassDto,
} from '@Classes/dto';
import { ClassesService } from '@Classes/services';

/**
 * Programación y edición de clases grupales (H06 / BE-6.1), restringida al rol
 * ADMIN mediante el sistema de roles global (`RolesGuard` + `@Roles('ADMIN')`).
 */
@ApiTags('classes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Programa una nueva clase grupal (Administrador)' })
  @ApiCreatedResponse({ type: ClassResponseDto })
  @ApiBadRequestResponse({
    description:
      'Nombre, cupo, fecha/hora pasada, duración fuera de 30-180 min o entrenador sin rol TRAINER.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({
    description: 'El entrenador seleccionado no existe.',
  })
  @ApiConflictResponse({
    description:
      'El entrenador ya tiene asignada otra clase grupal en ese horario (cruce con sesiones personales pendiente de H11).',
  })
  async create(@Body() dto: CreateClassDto): Promise<ClassResponseDto> {
    const created = await this.classesService.create(dto);
    return ClassResponseDto.fromEntity(created);
  }

  @Roles('ADMIN')
  @Patch(':classId')
  @ApiOperation({
    summary: 'Edita el horario, entrenador o cupo de una clase programada',
  })
  @ApiOkResponse({ type: ClassResponseDto })
  @ApiBadRequestResponse({
    description:
      'Nombre, cupo, fecha/hora pasada, duración fuera de 30-180 min o entrenador sin rol TRAINER.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({
    description: 'La clase o el entrenador no existen.',
  })
  @ApiConflictResponse({
    description:
      'Cruce de horario con otra clase grupal del entrenador o nuevo cupo menor a las reservas confirmadas (conteo real en BD pendiente de H07; cruce con sesiones personales pendiente de H11).',
  })
  async update(
    @Param('classId', ParseIntPipe) classId: number,
    @Body() dto: UpdateClassDto,
  ): Promise<ClassResponseDto> {
    const updated = await this.classesService.update(classId, dto);
    return ClassResponseDto.fromEntity(updated);
  }

  @Roles('ADMIN')
  @Put(':classId')
  @ApiOperation({
    summary: 'Edita una clase grupal programada (alias PUT de PATCH)',
  })
  @ApiOkResponse({ type: ClassResponseDto })
  @ApiBadRequestResponse({
    description:
      'Nombre, cupo, fecha/hora pasada, duración fuera de 30-180 min o entrenador sin rol TRAINER.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({
    description: 'La clase o el entrenador no existen.',
  })
  @ApiConflictResponse({
    description:
      'Cruce de horario con otra clase grupal del entrenador o nuevo cupo menor a las reservas confirmadas (conteo real en BD pendiente de H07; cruce con sesiones personales pendiente de H11).',
  })
  async replace(
    @Param('classId', ParseIntPipe) classId: number,
    @Body() dto: UpdateClassDto,
  ): Promise<ClassResponseDto> {
    const updated = await this.classesService.update(classId, dto);
    return ClassResponseDto.fromEntity(updated);
  }
}

