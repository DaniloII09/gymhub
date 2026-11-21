import { Module } from '@nestjs/common';
import { MembershipsModule } from '@Memberships';
import { UsersModule } from '@Users';
import { CheckInsController } from '@CheckIns/controllers';
import { CheckInsService } from '@CheckIns/services';
import { CheckInRepository } from '@CheckIns/repositories';

// Épica 4 · Check-in. Dueño: Danilo.
// H13: búsqueda de miembros con el estado de su membresía (contrato
// MEMBERSHIP_STATUS_SERVICE de MembershipsModule) y registro de ingresos.
@Module({
  imports: [UsersModule, MembershipsModule],
  controllers: [CheckInsController],
  providers: [CheckInsService, CheckInRepository],
})
export class CheckInsModule {}
