import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  RenewalRateReportController,
} from '@Reports/controllers';
import {
  IncomeReportService,
  RenewalRateReportService,
} from '@Reports/services';
import {
  IncomeRepository,
  RenewalRateRepository,
} from '@Reports/repositories';

// Épica 10 · Reportes y analítica. Dueños: Jaime (H29), Christian / Alexis Merino (H30).
// Sin tablas propias: los reportes consultan datos de otros módulos.
@Module({
  controllers: [IncomeReportController, RenewalRateReportController],
  providers: [
    IncomeReportService,
    IncomeRepository,
    RenewalRateReportService,
    RenewalRateRepository,
  ],
})
export class ReportsModule {}
