import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ChargesService } from '@Payments/services';
import { PendingChargeListDto, PendingChargesQueryDto } from '@Payments/dto';

/** Seguimiento de los pagos pendientes (H17). Solo Administrador. */
@ApiTags('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('charges')
export class PendingChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Get('pending')
  @ApiOperation({
    summary: 'Pagos pendientes con días de atraso y total adeudado (BE-17.1)',
    description:
      'Ordenados de más a menos días de atraso y, con los mismos días, por nombre del miembro. El total adeudado suma todo el filtro, no solo la página.',
  })
  @ApiOkResponse({ type: PendingChargeListDto })
  @ApiBadRequestResponse({ description: 'Tipo o página no válidos.' })
  async listPending(
    @Query() query: PendingChargesQueryDto,
  ): Promise<PendingChargeListDto> {
    const result = await this.chargesService.listPending(query);
    return PendingChargeListDto.fromResult(result);
  }
}
