import { Module } from '@nestjs/common';
import { MachinesController } from '@Machines/controllers';
import { MachinesService } from '@Machines/services';
import { MachineRepository } from '@Machines/repositories';

// Épica 7 · Máquinas. Dueño: Juan Carlos.
@Module({
  controllers: [MachinesController],
  providers: [MachinesService, MachineRepository],
})
export class MachinesModule {}
