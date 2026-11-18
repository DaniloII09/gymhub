import { Module } from '@nestjs/common';

// Épica 3 · Agenda de entrenadores. Dueño: Luis.
// BE-10.1: Disponibilidad de bloques horarios.
@Module({
  controllers: [AvailabilityBlocksController],
  providers: [AvailabilityBlocksService, AvailabilityBlockRepository],
  exports: [AvailabilityBlocksService],
})
export class TrainersModule {}
