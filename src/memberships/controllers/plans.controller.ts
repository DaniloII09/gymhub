import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
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
import { PlansService } from '@Memberships/services';
import {
  CreatePlanDto,
  ListPlansQueryDto,
  PlanListResponseDto,
  PlanResponseDto,
  UpdatePlanDto,
} from '@Memberships/dto';

/**
 * Planes del gimnasio (H03). El Administrador los crea, edita y desactiva;
 * el listado lo usa cualquier usuario con sesión (p. ej. recepción al vender
 * una membresía en H04). Por eso @Roles va en cada ruta y no en la clase.
 */
@ApiTags('plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // Sin @Roles: cualquier usuario con sesión.
  @Get()
  @ApiOperation({ summary: 'Lista los planes ordenados por nombre; ?active=true solo los activos' })
  @ApiOkResponse({ type: PlanListResponseDto })
  @ApiBadRequestResponse({ description: 'active no es true ni false.' })
  async list(@Query() query: ListPlansQueryDto): Promise<PlanListResponseDto> {
    const plans = await this.plansService.list(query.active === true);
    return { data: plans.map((plan) => PlanResponseDto.fromEntity(plan)) };
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crea un plan (Administrador)' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiBadRequestResponse({
    description: 'Dato inválido, o duración enviada en un plan DROP_IN.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiConflictResponse({
    description: 'Nombre repetido, o ya existe un plan de clase suelta activo.',
  })
  async create(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
    return PlanResponseDto.fromEntity(await this.plansService.create(dto));
  }

  @Roles('ADMIN')
  @Patch(':planId')
  @ApiOperation({ summary: 'Edita un plan (Administrador). El tipo no se puede cambiar.' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiBadRequestResponse({
    description: 'Dato inválido, se envió el tipo, o duración en un plan DROP_IN.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({ description: 'El plan no existe.' })
  @ApiConflictResponse({ description: 'Ya existe un plan con ese nombre.' })
  async update(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return PlanResponseDto.fromEntity(await this.plansService.update(planId, dto));
  }

  @Roles('ADMIN')
  @Patch(':planId/deactivate')
  @ApiOperation({
    summary: 'Desactiva un plan (Administrador). Las membresías vendidas no cambian.',
  })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  @ApiNotFoundResponse({ description: 'El plan no existe.' })
  async deactivate(@Param('planId', ParseIntPipe) planId: number): Promise<PlanResponseDto> {
    return PlanResponseDto.fromEntity(await this.plansService.deactivate(planId));
  }
}
