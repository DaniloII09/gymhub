import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MembershipsService } from '@Memberships/services';
import {
  CreateMembershipDto,
  DropInSoldDto,
  MembershipCreatedDto,
  SellDropInDto,
} from '@Memberships/dto';
import type { User } from '@PrismaClient';

/** Venta de membresías en recepción (H04). */
@ApiTags('memberships')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Roles('RECEPTION', 'ADMIN')
  @Post()
  @ApiOperation({
    summary:
      'Registra la compra o renovación de una membresía Mensual o Trimestral con su cobro pendiente (Recepción, Administrador)',
  })
  @ApiCreatedResponse({ type: MembershipCreatedDto })
  @ApiBadRequestResponse({
    description: 'Plan desactivado, plan de clase suelta o fecha de inicio anterior a hoy.',
  })
  @ApiForbiddenResponse({ description: 'El rol no es Recepción ni Administrador.' })
  @ApiNotFoundResponse({ description: 'El miembro o el plan no existen.' })
  @ApiConflictResponse({ description: 'El miembro ya tiene una membresía pendiente de pago.' })
  async create(
    @Body() dto: CreateMembershipDto,
    @CurrentUser() user: User,
  ): Promise<MembershipCreatedDto> {
    const { purchase, plan } = await this.membershipsService.purchase(dto, user.id);
    return MembershipCreatedDto.from(purchase.membership, plan, purchase.chargeId);
  }

  @Roles('RECEPTION', 'ADMIN')
  @Post('drop-in')
  @ApiOperation({
    summary:
      'Vende una clase suelta: cobra, ocupa el cupo de una clase de hoy y emite el comprobante en una sola operación (Recepción, Administrador)',
  })
  @ApiCreatedResponse({ type: DropInSoldDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos, sin plan de clase suelta activo, o tarjeta rechazada (con el motivo).',
  })
  @ApiForbiddenResponse({ description: 'El rol no es Recepción ni Administrador.' })
  @ApiNotFoundResponse({ description: 'El miembro o la clase no existen.' })
  @ApiConflictResponse({
    description:
      'La clase está llena, cancelada, ya inició o no es de hoy, o el miembro ya tiene una reserva en ella.',
  })
  async sellDropIn(
    @Body() dto: SellDropInDto,
    @CurrentUser() user: User,
  ): Promise<DropInSoldDto> {
    const sale = await this.membershipsService.sellDropIn(dto, user.id);
    return {
      membershipId: sale.membership.id,
      reservationId: sale.reservationId,
      receiptNumber: sale.receiptNumber,
      amount: sale.amount,
      endDate: sale.membership.endDate.toISOString().slice(0, 10),
      className: sale.className,
      classStartsAt: sale.classStartsAt,
    };
  }
}
