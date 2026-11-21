import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  OccupancyReportController,
  RenewalRateReportController,
} from '@Reports/controllers';
import {
  IncomeReportService,
  OccupancyReportService,
  RenewalRateReportService,
} from '@Reports/services';
import {
  IncomeRepository,
  OccupancyRepository,
  RenewalRateRepository,
} from '@Reports/repositories';

// Épica 10 · Reportes y analítica.
// Sin tablas propias: los reportes consultan datos de otros módulos.
// H28: ocupación de las clases (clases grupales y reservas).
// H29: ingresos de un periodo (comprobantes de Pagos).
// H30: tasa de renovación de membresías (Membresías y Pagos).
@Module({
  controllers: [
    IncomeReportController,
    OccupancyReportController,
    RenewalRateReportController,
  ],
  providers: [
    IncomeReportService,
    IncomeRepository,
    OccupancyReportService,
    OccupancyRepository,
    RenewalRateReportService,
    RenewalRateRepository,
  ],
})
export class ReportsModule {}
