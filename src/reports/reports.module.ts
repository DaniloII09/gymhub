import { Module } from '@nestjs/common';
import { IncomeReportController } from '@Reports/controllers';
import { IncomeReportService } from '@Reports/services';
import { IncomeRepository } from '@Reports/repositories';

// Épica 10 · Reportes y analítica. Dueño: Jaime.
// Sin tablas propias: los reportes consultan datos de otros módulos.
// H29: ingresos de un periodo (comprobantes de Pagos).
@Module({
  controllers: [IncomeReportController],
  providers: [IncomeReportService, IncomeRepository],
})
export class ReportsModule {}
