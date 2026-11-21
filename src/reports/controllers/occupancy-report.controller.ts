import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { OccupancyReportService } from '@Reports/services';
import { OccupancyReportDto, OccupancyReportQueryDto } from '@Reports/dto';

/** Ocupación de las clases (H28). Solo Administrador. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('reports')
export class OccupancyReportController {
  constructor(
    private readonly occupancyReportService: OccupancyReportService,
  ) {}

  @Get('occupancy')
  @ApiOperation({
    summary: 'Ocupación de las clases agrupadas por nombre (BE-28.1)',
    description:
      'Suma las reservas confirmadas y el cupo de las clases no canceladas que ya terminaron y empezaron entre from y to (fecha en la zona del gimnasio). Ordena de mayor a menor ocupación y marca las de mayor (HIGH) y menor (LOW).',
  })
  @ApiOkResponse({ type: OccupancyReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha con otro formato o inexistente, inicio posterior al fin, o rango mayor a 12 meses.',
  })
  @ApiNotFoundResponse({ description: 'No hay clases en ese rango.' })
  getOccupancy(
    @Query() query: OccupancyReportQueryDto,
  ): Promise<OccupancyReportDto> {
    return this.occupancyReportService.getOccupancy(query.from, query.to);
  }
}
