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
import {
  RenewalRateReportDto,
  RenewalRateReportQueryDto,
} from '@Reports/dto';
import { RenewalRateReportService } from '@Reports/services';

/** Reporte de tasa de renovación (H30). Solo Administrador. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('reports')
export class RenewalRateReportController {
  constructor(
    private readonly renewalRateReportService: RenewalRateReportService,
  ) {}

  @Get('renewal-rate')
  @ApiOperation({
    summary: 'Tasa de renovación de membresías por rango y por mes (BE-30.1)',
    description:
      'Cuenta membresías Mensuales y Trimestrales vencidas en [from, to] (excluye clases sueltas) y las que tienen una nueva membresía pagada iniciando antes o hasta 7 días después del vencimiento.',
  })
  @ApiOkResponse({ type: RenewalRateReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha con otro formato o inexistente, inicio posterior al fin o rango mayor a 12 meses.',
  })
  getRenewalRate(
    @Query() query: RenewalRateReportQueryDto,
  ): Promise<RenewalRateReportDto> {
    return this.renewalRateReportService.getRenewalRate(query.from, query.to);
  }
}
