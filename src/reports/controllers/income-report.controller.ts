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
import { IncomeReportService } from '@Reports/services';
import { IncomeReportDto, IncomeReportQueryDto } from '@Reports/dto';

/** Ingresos de un periodo (H29). Solo Administrador. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('reports')
export class IncomeReportController {
  constructor(private readonly incomeReportService: IncomeReportService) {}

  @Get('income')
  @ApiOperation({
    summary: 'Ingresos de un periodo por concepto y por mes (BE-29.1)',
    description:
      'Suma los comprobantes emitidos entre from y to (fecha de emisión en la zona del gimnasio). Separa membresías, clases sueltas y sesiones personales, e incluye todos los meses del rango.',
  })
  @ApiOkResponse({ type: IncomeReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha con otro formato o inexistente, inicio posterior al fin, o rango mayor a 12 meses.',
  })
  getIncome(@Query() query: IncomeReportQueryDto): Promise<IncomeReportDto> {
    return this.incomeReportService.getIncome(query.from, query.to);
  }
}
