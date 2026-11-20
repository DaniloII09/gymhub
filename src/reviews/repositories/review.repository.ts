import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { ReviewTargetType } from '@Reviews/dto';
import {
  DuplicateReviewError,
  ReviewNotAllowedError,
  ReviewTargetNotFoundError,
} from '@Reviews/errors';
import {
  earliestReviewableEndsAt,
  gymDateString,
  isWithinReviewWindow,
  reviewDeadlineDate,
  startOfGymDay,
} from '../services/review-window.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export const CLASS_NOT_FOUND_MESSAGE = 'No encontramos esa clase.';
export const SESSION_NOT_FOUND_MESSAGE = 'No encontramos esa sesión personal.';
export const CLASS_ATTENDANCE_REQUIRED_MESSAGE =
  'Solo puedes calificar clases a las que asististe.';
export const SESSION_COMPLETED_REQUIRED_MESSAGE =
  'Solo puedes calificar sesiones que se realizaron.';
export const REVIEW_NOT_FINISHED_MESSAGE =
  'Solo puedes calificar clases o sesiones que ya terminaron.';
export const REVIEW_WINDOW_EXPIRED_MESSAGE =
  'El plazo de 7 días para calificar ya venció.';

export interface PendingReviewTarget {
  targetType: ReviewTargetType;
  targetId: number;
  title: string;
  trainerId: string;
  trainerName: string;
  startsAt: Date;
  endsAt: Date;
  reviewDeadline: string;
}

export interface StoredReview {
  id: number;
  targetType: ReviewTargetType;
  targetId: number;
  title: string;
  trainerId: string;
  trainerName: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface CreateReviewData {
  memberId: string;
  targetType: ReviewTargetType;
  targetId: number;
  rating: number;
  comment: string | null;
  now: Date;
}

function hasClassAttendanceCheckIn(
  checkInDates: Date[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  const startDay = gymDateString(startsAt);
  const endDay = gymDateString(endsAt);
  const endMs = endsAt.getTime();
  return checkInDates.some((checkedInAt) => {
    if (checkedInAt.getTime() > endMs) return false;
    const checkInDay = gymDateString(checkedInAt);
    return checkInDay === startDay || checkInDay === endDay;
  });
}

/** Único punto del módulo que habla con la tabla `reviews` y verifica elegibilidad. */
@Injectable()
export class ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPendingTargets(
    memberId: string,
    now: Date,
  ): Promise<PendingReviewTarget[]> {
    const earliestEndsAt = earliestReviewableEndsAt(now);

    const [reservations, sessions] = await Promise.all([
      this.prisma.classReservation.findMany({
        where: {
          memberId,
          status: 'CONFIRMED',
          gymClass: {
            status: 'SCHEDULED',
            endsAt: { lte: now, gte: earliestEndsAt },
            reviews: { none: { memberId } },
          },
        },
        select: {
          gymClass: {
            select: {
              id: true,
              name: true,
              startsAt: true,
              endsAt: true,
              trainer: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.personalSession.findMany({
        where: {
          memberId,
          status: 'COMPLETED',
          outcome: 'COMPLETED',
          endsAt: { lte: now, gte: earliestEndsAt },
          reviews: { none: { memberId } },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          trainer: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const classCandidates = reservations
      .map((r) => r.gymClass)
      .filter((gc) => isWithinReviewWindow(gc.endsAt, now));

    let checkInDates: Date[] = [];
    if (classCandidates.length > 0) {
      const minStart = classCandidates.reduce(
        (min, gc) => (gc.startsAt < min ? gc.startsAt : min),
        classCandidates[0].startsAt,
      );
      const checkIns = await this.prisma.checkIn.findMany({
        where: {
          memberId,
          checkedInAt: {
            gte: startOfGymDay(gymDateString(minStart)),
            lte: now,
          },
        },
        select: { checkedInAt: true },
      });
      checkInDates = checkIns.map((c) => c.checkedInAt);
    }

    const pendingClasses: PendingReviewTarget[] = classCandidates
      .filter((gc) =>
        hasClassAttendanceCheckIn(checkInDates, gc.startsAt, gc.endsAt),
      )
      .map((gc) => ({
        targetType: 'CLASS' as const,
        targetId: gc.id,
        title: gc.name,
        trainerId: gc.trainer.id,
        trainerName: gc.trainer.fullName,
        startsAt: gc.startsAt,
        endsAt: gc.endsAt,
        reviewDeadline: reviewDeadlineDate(gc.endsAt),
      }));

    const pendingSessions: PendingReviewTarget[] = sessions
      .filter((s) => isWithinReviewWindow(s.endsAt, now))
      .map((s) => ({
        targetType: 'PERSONAL_SESSION' as const,
        targetId: s.id,
        title: 'Sesión personal',
        trainerId: s.trainer.id,
        trainerName: s.trainer.fullName,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        reviewDeadline: reviewDeadlineDate(s.endsAt),
      }));

    return [...pendingClasses, ...pendingSessions].sort(
      (a, b) =>
        b.endsAt.getTime() - a.endsAt.getTime() ||
        a.targetType.localeCompare(b.targetType) ||
        b.targetId - a.targetId,
    );
  }

  async findByMember(memberId: string): Promise<StoredReview[]> {
    const rows = await this.prisma.review.findMany({
      where: { memberId },
      include: {
        gymClass: {
          select: {
            id: true,
            name: true,
            trainer: { select: { id: true, fullName: true } },
          },
        },
        personalSession: {
          select: {
            id: true,
            trainer: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => {
      if (row.gymClass) {
        return {
          id: row.id,
          targetType: 'CLASS' as const,
          targetId: row.gymClass.id,
          title: row.gymClass.name,
          trainerId: row.gymClass.trainer.id,
          trainerName: row.gymClass.trainer.fullName,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.createdAt,
        };
      }
      const session = row.personalSession!;
      return {
        id: row.id,
        targetType: 'PERSONAL_SESSION' as const,
        targetId: session.id,
        title: 'Sesión personal',
        trainerId: session.trainer.id,
        trainerName: session.trainer.fullName,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.createdAt,
      };
    });
  }

  async createReview(data: CreateReviewData): Promise<StoredReview> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.targetType === 'CLASS') {
          return this.createClassReview(tx, data);
        }
        return this.createSessionReview(tx, data);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new DuplicateReviewError();
      }
      throw error;
    }
  }

  private async createClassReview(
    tx: Prisma.TransactionClient,
    data: CreateReviewData,
  ): Promise<StoredReview> {
    const gymClass = await tx.gymClass.findUnique({
      where: { id: data.targetId },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
        trainer: { select: { id: true, fullName: true } },
      },
    });
    if (!gymClass) {
      throw new ReviewTargetNotFoundError(CLASS_NOT_FOUND_MESSAGE);
    }

    const existing = await tx.review.findUnique({
      where: {
        memberId_gymClassId: {
          memberId: data.memberId,
          gymClassId: gymClass.id,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new DuplicateReviewError();
    }

    if (gymClass.status !== 'SCHEDULED') {
      throw new ReviewNotAllowedError(CLASS_ATTENDANCE_REQUIRED_MESSAGE);
    }

    const reservation = await tx.classReservation.findFirst({
      where: {
        classId: gymClass.id,
        memberId: data.memberId,
        status: 'CONFIRMED',
      },
      select: { id: true },
    });
    if (!reservation) {
      throw new ReviewNotAllowedError(CLASS_ATTENDANCE_REQUIRED_MESSAGE);
    }

    const checkIns = await tx.checkIn.findMany({
      where: {
        memberId: data.memberId,
        checkedInAt: {
          gte: startOfGymDay(gymDateString(gymClass.startsAt)),
          lte: gymClass.endsAt,
        },
      },
      select: { checkedInAt: true },
    });
    if (
      !hasClassAttendanceCheckIn(
        checkIns.map((c) => c.checkedInAt),
        gymClass.startsAt,
        gymClass.endsAt,
      )
    ) {
      throw new ReviewNotAllowedError(CLASS_ATTENDANCE_REQUIRED_MESSAGE);
    }

    if (data.now.getTime() < gymClass.endsAt.getTime()) {
      throw new ReviewNotAllowedError(REVIEW_NOT_FINISHED_MESSAGE);
    }
    if (!isWithinReviewWindow(gymClass.endsAt, data.now)) {
      throw new ReviewNotAllowedError(REVIEW_WINDOW_EXPIRED_MESSAGE);
    }

    const created = await tx.review.create({
      data: {
        memberId: data.memberId,
        gymClassId: gymClass.id,
        rating: data.rating,
        comment: data.comment,
      },
    });

    return {
      id: created.id,
      targetType: 'CLASS',
      targetId: gymClass.id,
      title: gymClass.name,
      trainerId: gymClass.trainer.id,
      trainerName: gymClass.trainer.fullName,
      rating: created.rating,
      comment: created.comment,
      createdAt: created.createdAt,
    };
  }

  private async createSessionReview(
    tx: Prisma.TransactionClient,
    data: CreateReviewData,
  ): Promise<StoredReview> {
    const session = await tx.personalSession.findFirst({
      where: { id: data.targetId, memberId: data.memberId },
      select: {
        id: true,
        status: true,
        outcome: true,
        endsAt: true,
        trainer: { select: { id: true, fullName: true } },
      },
    });
    if (!session) {
      throw new ReviewTargetNotFoundError(SESSION_NOT_FOUND_MESSAGE);
    }

    const existing = await tx.review.findUnique({
      where: {
        memberId_personalSessionId: {
          memberId: data.memberId,
          personalSessionId: session.id,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new DuplicateReviewError();
    }

    if (session.status !== 'COMPLETED' || session.outcome !== 'COMPLETED') {
      throw new ReviewNotAllowedError(SESSION_COMPLETED_REQUIRED_MESSAGE);
    }

    if (data.now.getTime() < session.endsAt.getTime()) {
      throw new ReviewNotAllowedError(REVIEW_NOT_FINISHED_MESSAGE);
    }
    if (!isWithinReviewWindow(session.endsAt, data.now)) {
      throw new ReviewNotAllowedError(REVIEW_WINDOW_EXPIRED_MESSAGE);
    }

    const created = await tx.review.create({
      data: {
        memberId: data.memberId,
        personalSessionId: session.id,
        rating: data.rating,
        comment: data.comment,
      },
    });

    return {
      id: created.id,
      targetType: 'PERSONAL_SESSION',
      targetId: session.id,
      title: 'Sesión personal',
      trainerId: session.trainer.id,
      trainerName: session.trainer.fullName,
      rating: created.rating,
      comment: created.comment,
      createdAt: created.createdAt,
    };
  }
}
