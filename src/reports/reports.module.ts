import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  OccupancyReportController,
  RatingsReportController,
} from '@Reports/controllers';
import {
  IncomeReportService,
  OccupancyReportService,
  RatingsReportService,
} from '@Reports/services';
import {
  IncomeRepository,
  OccupancyRepository,
  RatingsRepository,
} from '@Reports/repositories';

// Épica 10 · Reportes y analítica.
// Sin tablas propias: los reportes consultan datos de otros módulos.
// H23: promedios de calificación (reseñas de clases y sesiones).
// H28: ocupación de las clases (clases grupales y reservas).
// H29: ingresos de un periodo (comprobantes de Pagos).
@Module({
  controllers: [
    IncomeReportController,
    OccupancyReportController,
    RatingsReportController,
  ],
  providers: [
    IncomeReportService,
    IncomeRepository,
    OccupancyReportService,
    OccupancyRepository,
    RatingsReportService,
    RatingsRepository,
  ],
})
export class ReportsModule {}
