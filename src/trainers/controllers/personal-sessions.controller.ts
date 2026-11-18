import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
  CreatePersonalSessionDto,
  ListMySessionsQueryDto,
  PersonalSessionListDto,
  PersonalSessionResponseDto,
  SessionPricingResponseDto,
  UpdateSessionPricingDto,
} from '@Trainers/dto';
import {
  PersonalSessionsService,
  SessionPricingService,
} from '@Trainers/services';
import type { User } from '@PrismaClient';

/**
 * Agendamiento de sesiones personales con entrenador, listado "Mis sesiones"
 * y configuración de tarifa (H11 / BE-11.2 / DB-11.1).
 *
 * Nota: no expone cancelación de sesiones personales (no existe en esta versión).
 */
@ApiTags('personal-sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('personal-sessions')
export class PersonalSessionsController {
  constructor(
    private readonly sessionsService: PersonalSessionsService,
    private readonly pricingService: SessionPricingService,
  ) {}

  @Get('pricing')
  @ApiOperation({
    summary: 'Consulta el precio configurado para una sesión personal',
  })
  @ApiOkResponse({ type: SessionPricingResponseDto })
  getPricing(): Promise<SessionPricingResponseDto> {
    return this.pricingService.getPricingStatus();
  }

  @Roles('ADMIN')
  @Put('pricing')
  @ApiOperation({
    summary: 'Configura o actualiza el precio de la sesión personal (Administrador)',
  })
  @ApiOkResponse({ type: SessionPricingResponseDto })
  @ApiBadRequestResponse({ description: 'Precio inválido.' })
  @ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
  updatePricing(
    @Body() dto: UpdateSessionPricingDto,
    @CurrentUser() user: User,
  ): Promise<SessionPricingResponseDto> {
    return this.pricingService.updatePrice(dto.price, user.id);
  }

  @Roles('MEMBER')
  @Get('me')
  @ApiOperation({
    summary: 'Lista las sesiones personales del miembro autenticado ("Mis sesiones")',
  })
  @ApiOkResponse({ type: PersonalSessionListDto })
  @ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
  async listMine(
    @CurrentUser() user: User,
    @Query() query: ListMySessionsQueryDto,
  ): Promise<PersonalSessionListDto> {
    const items = await this.sessionsService.listMine(user.id, query.status);
    return {
      data: items.map((item) => PersonalSessionResponseDto.fromEntity(item)),
    };
  }

  @Roles('MEMBER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Agenda una sesión personal de 60 min y genera su cobro PENDING en la misma transacción (BE-11.2)',
  })
  @ApiCreatedResponse({ type: PersonalSessionResponseDto })
  @ApiBadRequestResponse({
    description:
      'Menos de 12 horas de anticipación, horario fuera de bloques disponibles o entrenador inválido.',
  })
  @ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
  @ApiNotFoundResponse({ description: 'El entrenador no existe.' })
  @ApiConflictResponse({ description: 'Ese horario ya fue tomado.' })
  @ApiServiceUnavailableResponse({
    description: 'El precio de la sesión personal aún no está configurado.',
  })
  async book(
    @Body() dto: CreatePersonalSessionDto,
    @CurrentUser() user: User,
  ): Promise<PersonalSessionResponseDto> {
    const booked = await this.sessionsService.book(user.id, dto);
    return PersonalSessionResponseDto.fromEntity(booked);
  }
}
