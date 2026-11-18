import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseIntPipe,
  Post,
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
  ClassReservationResponseDto,
  ListMyReservationsQueryDto,
  MemberReservationListDto,
} from '@Classes/dto';
import { ClassReservationsService } from '@Classes/services';
import type { User } from '@PrismaClient';

/**
 * Reservas de clases grupales del miembro autenticado (H07 / BE-7.2).
 * El miembro siempre se extrae del token JWT, nunca de parámetros del cliente.
 */
@ApiTags('classes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({
  description:
    'El usuario no es Miembro o su membresía no habilita reservas (ej. inactiva o DROP_IN).',
})
@Roles('MEMBER')
@Controller('classes')
export class ClassReservationsController {
  constructor(
    private readonly reservationsService: ClassReservationsService,
  ) {}

  @Get('reservations/me')
  @ApiOperation({
    summary: 'Lista mis reservas en clases grupales (Miembro)',
  })
  @ApiOkResponse({ type: MemberReservationListDto })
  @ApiBadRequestResponse({ description: 'Estado de filtro no válido.' })
  async listMine(
    @CurrentUser() user: User,
    @Query() query: ListMyReservationsQueryDto,
  ): Promise<MemberReservationListDto> {
    const items = await this.reservationsService.listMine(user.id, query.status);
    return {
      data: items.map((item) => ClassReservationResponseDto.fromEntity(item)),
    };
  }

  @Patch('reservations/:reservationId/cancel')
  @ApiOperation({ summary: 'Cancela una reserva propia hasta 2 horas antes (BE-8.1)' })
  @ApiOkResponse({ type: ClassReservationResponseDto })
  @ApiNotFoundResponse({ description: 'La reserva no existe o pertenece a otro miembro.' })
  @ApiConflictResponse({ description: 'La clase inicia en menos de 2 horas.' })
  async cancelMine(
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @CurrentUser() user: User,
  ): Promise<ClassReservationResponseDto> {
    const cancelled = await this.reservationsService.cancelMine(reservationId, user.id);
    return ClassReservationResponseDto.fromEntity(cancelled);
  }

  @Post(':classId/reservations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reserva un cupo en una clase grupal programada (BE-7.2)',
    description:
      'Requiere membresía MONTHLY o QUARTERLY ACTIVE (contrato MEMBERSHIP_STATUS_SERVICE / H04).',
  })
  @ApiCreatedResponse({ type: ClassReservationResponseDto })
  @ApiNotFoundResponse({ description: 'La clase no existe.' })
  @ApiConflictResponse({
    description:
      'Clase llena (code: CLASS_FULL), reserva CONFIRMED duplicada o clase cancelada/iniciada.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'El proveedor de estado de membresías (BE-4.3 / H04) aún no está disponible.',
  })
  async reserve(
    @Param('classId', ParseIntPipe) classId: number,
    @CurrentUser() user: User,
  ): Promise<ClassReservationResponseDto> {
    const created = await this.reservationsService.reserve(classId, user.id);
    return ClassReservationResponseDto.fromEntity(created);
  }
}
