import { Module } from '@nestjs/common';
import {
  IncomeReportController,
  OccupancyReportController,
} from '@Reports/controllers';
import { IncomeReportService, OccupancyReportService } from '@Reports/services';
import { IncomeRepository, OccupancyRepository } from '@Reports/repositories';

// Épica 10 · Reportes y analítica. Dueño: Jaime.
// Sin tablas propias: los reportes consultan datos de otros módulos.
// H28: ocupación de las clases (clases grupales y reservas).
// H29: ingresos de un periodo (comprobantes de Pagos).
@Module({
  controllers: [IncomeReportController, OccupancyReportController],
  providers: [
    IncomeReportService,
    IncomeRepository,
    OccupancyReportService,
    OccupancyRepository,
  ],
})
export class ReportsModule {}
