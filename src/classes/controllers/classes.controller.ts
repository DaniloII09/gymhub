import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
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
  ListClassesQueryDto,
  UpdateClassDto,
} from '@Classes/dto';
import { ClassesService } from '@Classes/services';

/**
 * Programación, edición y consulta del calendario de clases grupales (H06 / H07).
 * La creación y edición están restringidas a ADMIN mediante `RolesGuard` + `@Roles('ADMIN')`.
 */
@ApiTags('classes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista las clases del calendario semanal con su cupo y reservas confirmadas',
  })
  @ApiOkResponse({ type: ClassResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'Rango de fechas inválido (to debe ser posterior a from).',
  })
  async list(
    @Query() query: ListClassesQueryDto,
  ): Promise<ClassResponseDto[]> {
    const items = await this.classesService.list(query);
    return items.map((item) => ClassResponseDto.fromEntity(item));
  }

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
      'El entrenador ya tiene asignada otra clase grupal o una sesión personal en ese horario.',
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
      'Cruce de horario con otra clase grupal o sesión personal del entrenador, o nuevo cupo menor a las reservas confirmadas.',
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
      'Cruce de horario con otra clase grupal o sesión personal del entrenador, o nuevo cupo menor a las reservas confirmadas.',
  })
  async replace(
    @Param('classId', ParseIntPipe) classId: number,
    @Body() dto: UpdateClassDto,
  ): Promise<ClassResponseDto> {
    const updated = await this.classesService.update(classId, dto);
    return ClassResponseDto.fromEntity(updated);
  }
}

