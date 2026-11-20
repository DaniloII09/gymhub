import { Module } from '@nestjs/common';
import { ProgressController } from '@Routines/controllers';
import { ProgressRepository } from '@Routines/repositories';
import { ProgressService } from '@Routines/services';

// Épica 6 · Progreso y evolución (H19). Dueño: Christian / Alexis Merino.
@Module({
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
})
export class RoutinesModule {}
