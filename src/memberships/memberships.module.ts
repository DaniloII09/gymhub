import { Module } from '@nestjs/common';
import { MyMembershipController } from '@Memberships/controllers';
import { MyMembershipService } from '@Memberships/services';

// Épica 1 · Membresías y planes. Dueño: Danilo.
// Esqueleto. Agregá controllers/, services/, repositories/ y dto/ a medida que
// los creés, y declaralos acá. Usá el módulo de usuarios como referencia.
//
// H05 (Juan Carlos): "Mi membresía" consulta el contrato
// MEMBERSHIP_STATUS_SERVICE, que registra H04 en este mismo módulo.
@Module({
  controllers: [MyMembershipController],
  providers: [MyMembershipService],
})
export class MembershipsModule {}
