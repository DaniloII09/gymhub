import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
import { CurrentUser, Roles } from '@Auth/decorators';
import { CheckInsService } from '@CheckIns/services';
import {
  CheckInLookupQueryDto,
  CheckInLookupResponseDto,
  CheckInResponseDto,
  CreateCheckInDto,
} from '@CheckIns/dto';
import type { User } from '@PrismaClient';

/** Check-in en recepción (H13). Solo Recepción y Administrador. */
@ApiTags('check-ins')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El rol no es Recepción ni Administrador.' })
@Roles('RECEPTION', 'ADMIN')
@Controller('check-ins')
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @Get('lookup')
  @ApiOperation({
    summary:
      'Busca miembros por código exacto o parte del nombre (máx. 10) con el estado de su membresía y su próxima fecha de pago',
  })
  @ApiOkResponse({ type: CheckInLookupResponseDto })
  @ApiBadRequestResponse({ description: 'q fuera de 2 a 100 caracteres.' })
  async lookup(@Query() query: CheckInLookupQueryDto): Promise<CheckInLookupResponseDto> {
    return { data: await this.checkInsService.lookup(query.q) };
  }

  @Post()
  @ApiOperation({ summary: 'Registra el ingreso de un miembro con la hora del servidor' })
  @ApiCreatedResponse({ type: CheckInResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiNotFoundResponse({ description: 'El miembro no existe.' })
  @ApiConflictResponse({ description: 'El miembro ya registró su ingreso hace menos de 30 minutos.' })
  register(@Body() dto: CreateCheckInDto, @CurrentUser() user: User): Promise<CheckInResponseDto> {
    return this.checkInsService.register(dto.memberId, user.id);
  }
}
