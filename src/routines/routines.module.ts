import { Module } from '@nestjs/common';
import { RoutinesController } from '@Routines/controllers';
import { RoutineRepository } from '@Routines/repositories';
import { RoutinesService } from '@Routines/services';

// Épica 6 · Rutinas y progreso (H18). Dueño: Christian / Alexis Merino.
@Module({
  controllers: [RoutinesController],
  providers: [RoutinesService, RoutineRepository],
})
export class RoutinesModule {}
