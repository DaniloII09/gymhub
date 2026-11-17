import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { PaginationQueryDto } from '@Common/pagination';
import {
  ChargesService,
  PaymentsService,
  ReceiptsService,
} from '@Payments/services';
import {
  CardPaymentDto,
  CardPaymentResponseDto,
  ChargeListDto,
  ChargeResponseDto,
  ListChargesQueryDto,
  ReceiptListDto,
} from '@Payments/dto';
import type { User } from '@PrismaClient';

/**
 * "Mis pagos" del miembro (H16): sus cobros, sus comprobantes y el pago en
 * línea con tarjeta. El miembro siempre se toma del token; ninguna ruta
 * recibe el id de otro miembro.
 */
@ApiTags('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Miembro.' })
@Roles('MEMBER')
@Controller()
export class MemberPaymentsController {
  constructor(
    private readonly chargesService: ChargesService,
    private readonly receiptsService: ReceiptsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('charges/me')
  @ApiOperation({
    summary: 'Mis cobros, filtrables por estado (BE-16.1)',
    description: 'Del que vence primero al último.',
  })
  @ApiOkResponse({ type: ChargeListDto })
  @ApiBadRequestResponse({ description: 'Estado no válido.' })
  async myCharges(
    @CurrentUser() user: User,
    @Query() query: ListChargesQueryDto,
  ): Promise<ChargeListDto> {
    const charges = await this.chargesService.listMine(user.id, query.status);
    return {
      data: charges.map((charge) => ChargeResponseDto.fromEntity(charge)),
    };
  }

  @Get('receipts/me')
  @ApiOperation({
    summary: 'Mis comprobantes, del más reciente al más antiguo (BE-16.1)',
  })
  @ApiOkResponse({ type: ReceiptListDto })
  @ApiBadRequestResponse({ description: 'Página no válida.' })
  async myReceipts(
    @CurrentUser() user: User,
    @Query() query: PaginationQueryDto,
  ): Promise<ReceiptListDto> {
    const page = await this.receiptsService.listMine(user.id, query);
    return ReceiptListDto.fromPage(page);
  }

  @Post('charges/:chargeId/card-payment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pago en línea de mi cobro con tarjeta (BE-16.2)',
    description:
      'Pasa por la pasarela simulada (2 s). Una solicitud repetida con la misma idempotencyKey devuelve el resultado original sin cobrar dos veces.',
  })
  @ApiCreatedResponse({ type: CardPaymentResponseDto })
  @ApiBadRequestResponse({
    description:
      'Datos de tarjeta inválidos, o tarjeta rechazada con el motivo en `message`.',
  })
  @ApiNotFoundResponse({
    description: 'El cobro no existe o es de otro miembro.',
  })
  @ApiConflictResponse({ description: 'El cobro ya está pagado.' })
  async payWithCard(
    @CurrentUser() user: User,
    @Param('chargeId', ParseIntPipe) chargeId: number,
    @Body() dto: CardPaymentDto,
  ): Promise<CardPaymentResponseDto> {
    const payment = await this.paymentsService.payCardAsMember(
      user.id,
      chargeId,
      dto,
    );
    return CardPaymentResponseDto.fromEntity(payment);
  }
}
