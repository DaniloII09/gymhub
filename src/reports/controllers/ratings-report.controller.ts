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
import { RatingsReportDto, RatingsReportQueryDto } from '@Reports/dto';
import { RatingsReportService } from '@Reports/services';

/** Reporte de promedios de calificación (H23). Solo Administrador. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token o no es válido.' })
@ApiForbiddenResponse({ description: 'El usuario no es Administrador.' })
@Roles('ADMIN')
@Controller('reports')
export class RatingsReportController {
  constructor(private readonly ratingsReportService: RatingsReportService) {}

  @Get('ratings')
  @ApiOperation({
    summary: 'Promedios de calificación por entrenador y por clase (BE-23.1)',
    description:
      'Agrupa reseñas creadas entre from y to (hasta 12 meses, fecha local del gimnasio). El promedio por entrenador incluye clases y sesiones personales. Orden ascendente por promedio y nombre.',
  })
  @ApiOkResponse({ type: RatingsReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha con otro formato o inexistente, inicio posterior al fin o rango mayor a 12 meses.',
  })
  getRatings(@Query() query: RatingsReportQueryDto): Promise<RatingsReportDto> {
    return this.ratingsReportService.getRatings(query.from, query.to);
  }
}
