import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import { ReceiptsService } from '@Payments/services';
import type { User } from '@PrismaClient';

/** Descarga del comprobante en PDF (H15, y H16 para el miembro). */
@ApiTags('payments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  // Sin @Roles: Recepción, Administrador o el Miembro dueño. El servicio
  // responde 404 a cualquier otro.
  @Get(':receiptId/pdf')
  @ApiOperation({
    summary:
      'PDF del comprobante (Recepción, Administrador o el Miembro dueño)',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'comprobante-{número}.pdf' })
  @ApiNotFoundResponse({ description: 'No existe o es de otro miembro.' })
  async pdf(
    @Param('receiptId', ParseIntPipe) receiptId: number,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    const { number, pdf } = await this.receiptsService.getPdf(receiptId, user);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="comprobante-${number}.pdf"`,
    });
  }
}
