import { Module } from '@nestjs/common';
import { ClassesController } from '@Classes/controllers';
import { ClassesService } from '@Classes/services';
import { ClassRepository } from '@Classes/repositories';

// Épica 2 · Clases grupales. Dueño: Luis (H06, H07).
@Module({
  controllers: [ClassesController],
  providers: [ClassesService, ClassRepository],
  exports: [ClassesService, ClassRepository],
})
export class ClassesModule {}

