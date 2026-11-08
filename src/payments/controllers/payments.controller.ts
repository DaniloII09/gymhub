import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import { PaymentsService } from '@Payments/services';
import { CreatePaymentDto, PaymentResponseDto } from '@Payments/dto';
import type { User } from '@PrismaClient';

/** Registro de pagos en recepción (H15). */
@ApiTags('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles('RECEPTION', 'ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Paga un cobro pendiente en efectivo o con tarjeta y emite el comprobante',
    description:
      'Una solicitud repetida con la misma idempotencyKey devuelve el resultado original sin cobrar dos veces.',
  })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({
    description:
      'Datos inválidos, o tarjeta rechazada con el motivo en `message`.',
  })
  @ApiForbiddenResponse({
    description: 'El usuario no es Recepción ni Administrador.',
  })
  @ApiNotFoundResponse({ description: 'El cobro no existe.' })
  @ApiConflictResponse({ description: 'El cobro ya está pagado.' })
  async create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: User,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentsService.pay(dto, user.id);
    return PaymentResponseDto.fromEntity(payment);
  }
}
