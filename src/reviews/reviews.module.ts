import { Module } from '@nestjs/common';
import { ReviewsController } from '@Reviews/controllers';
import { ReviewRepository } from '@Reviews/repositories';
import { ReviewsService } from '@Reviews/services';

// Épica 8 · Reseñas (H22). Dueño: Christian / Alexis Merino.
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewRepository],
})
export class ReviewsModule {}
