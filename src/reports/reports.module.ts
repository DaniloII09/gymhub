import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  OccupancyReportController,
  RatingsReportController,
  RenewalRateReportController,
} from '@Reports/controllers';
import {
  IncomeReportService,
  OccupancyReportService,
  RatingsReportService,
  RenewalRateReportService,
} from '@Reports/services';
import {
  IncomeRepository,
  OccupancyRepository,
  RatingsRepository,
  RenewalRateRepository,
} from '@Reports/repositories';

// Épica 10 · Reportes y analítica.
// Sin tablas propias: los reportes consultan datos de otros módulos.
// H23: promedios de calificación (reseñas de clases y sesiones).
// H28: ocupación de las clases (clases grupales y reservas).
// H29: ingresos de un periodo (comprobantes de Pagos).
// H30: tasa de renovación de membresías (Membresías y Pagos).
@Module({
  controllers: [
    IncomeReportController,
    OccupancyReportController,
    RatingsReportController,
    RenewalRateReportController,
  ],
  providers: [
    IncomeReportService,
    IncomeRepository,
    OccupancyReportService,
    OccupancyRepository,
    RatingsReportService,
    RatingsRepository,
    RenewalRateReportService,
    RenewalRateRepository,
  ],
})
export class ReportsModule {}
