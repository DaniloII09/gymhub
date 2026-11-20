import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateReviewDto } from '@Reviews/dto';
import {
  DuplicateReviewError,
  ReviewForbiddenError,
  ReviewNotAllowedError,
  ReviewTargetNotFoundError,
} from '@Reviews/errors';
import {
  ReviewRepository,
  type PendingReviewTarget,
  type StoredReview,
} from '@Reviews/repositories';

/**
 * Calificación de clases grupales y sesiones personales (H22 · BE-22.1, BE-22.2).
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly reviewRepository: ReviewRepository) {}

  listPending(
    memberId: string,
    now: Date = new Date(),
  ): Promise<PendingReviewTarget[]> {
    return this.reviewRepository.findPendingTargets(memberId, now);
  }

  listMine(memberId: string): Promise<StoredReview[]> {
    return this.reviewRepository.findByMember(memberId);
  }

  async create(
    memberId: string,
    dto: CreateReviewDto,
    now: Date = new Date(),
  ): Promise<StoredReview> {
    try {
      return await this.reviewRepository.createReview({
        memberId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        now,
      });
    } catch (error) {
      if (error instanceof ReviewTargetNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ReviewForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      if (
        error instanceof DuplicateReviewError ||
        error instanceof ReviewNotAllowedError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
