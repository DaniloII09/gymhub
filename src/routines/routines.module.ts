import { Module } from '@nestjs/common';
import { ProgressController, RoutinesController } from '@Routines/controllers';
import { ProgressRepository, RoutineRepository } from '@Routines/repositories';
import { ProgressService, RoutinesService } from '@Routines/services';

// Épica 6 · Rutinas y progreso (H18 y H19). Dueño: Christian / Alexis Merino.
@Module({
  controllers: [RoutinesController, ProgressController],
  providers: [
    RoutinesService,
    RoutineRepository,
    ProgressService,
    ProgressRepository,
  ],
})
export class RoutinesModule {}
