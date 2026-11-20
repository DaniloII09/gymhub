import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  RatingsReportController,
} from '@Reports/controllers';
import {
  IncomeReportService,
  RatingsReportService,
} from '@Reports/services';
import {
  IncomeRepository,
  RatingsRepository,
} from '@Reports/repositories';

// Épica 10 · Reportes y analítica. Dueños: Jaime (H29), Christian / Alexis Merino (H23).
// Sin tablas propias: los reportes consultan datos de otros módulos.
@Module({
  controllers: [IncomeReportController, RatingsReportController],
  providers: [
    IncomeReportService,
    IncomeRepository,
    RatingsReportService,
    RatingsRepository,
  ],
})
export class ReportsModule {}
