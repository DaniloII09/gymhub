import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from '@Reviews/dto';
import {
  DuplicateReviewError,
  ReviewNotAllowedError,
  ReviewTargetNotFoundError,
} from '@Reviews/errors';
import {
  CLASS_ATTENDANCE_REQUIRED_MESSAGE,
  REVIEW_WINDOW_EXPIRED_MESSAGE,
  SESSION_COMPLETED_REQUIRED_MESSAGE,
  type ReviewRepository,
} from '@Reviews/repositories';
import {
  addGymDays,
  endOfGymDay,
  gymDateString,
  isWithinReviewWindow,
  reviewDeadlineDate,
  ReviewsService,
  startOfGymDay,
} from '@Reviews/services';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

describe('Ventana de calificación en zona del gimnasio (America/El_Salvador)', () => {
  it('usa fecha local de El Salvador (UTC-6), no UTC', () => {
    // 10 nov 20:00 en El Salvador = 11 nov 02:00 UTC.
    const endsAt = new Date('2026-11-11T02:00:00.000Z');
    expect(gymDateString(endsAt)).toBe('2026-11-10');
    expect(addGymDays('2026-11-10', 7)).toBe('2026-11-17');
    expect(reviewDeadlineDate(endsAt)).toBe('2026-11-17');
    expect(startOfGymDay('2026-11-10').toISOString()).toBe('2026-11-10T06:00:00.000Z');
    expect(endOfGymDay('2026-11-17').toISOString()).toBe('2026-11-18T05:59:59.999Z');
  });

  it('permite desde endsAt hasta el final del séptimo día del gimnasio y rechaza antes o después', () => {
    const endsAt = new Date('2026-11-11T02:00:00.000Z'); // 2026-11-10 20:00 SV

    expect(isWithinReviewWindow(endsAt, new Date('2026-11-11T01:59:59.999Z'))).toBe(false);
    expect(isWithinReviewWindow(endsAt, endsAt)).toBe(true);
    // Séptimo día en El Salvador a las 23:59:59.999 (ya es 18 nov 05:59 UTC).
    expect(isWithinReviewWindow(endsAt, new Date('2026-11-18T05:59:59.999Z'))).toBe(true);
    // Octavo día en El Salvador (00:00:00.000 SV = 06:00:00.000 UTC).
    expect(isWithinReviewWindow(endsAt, new Date('2026-11-18T06:00:00.000Z'))).toBe(false);
  });
});

describe('CreateReviewDto validación (BE-22.2)', () => {
  const validateDto = async (payload: object) => {
    const dto = plainToInstance(CreateReviewDto, payload);
    return { dto, errors: await validate(dto) };
  };

  it('acepta 1..5 estrellas y recorta el comentario opcional hasta 500 caracteres', async () => {
    const { dto, errors } = await validateDto({
      targetType: 'CLASS',
      targetId: 10,
      rating: 4,
      comment: '  Muy buena clase  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.comment).toBe('Muy buena clase');

    const blankComment = await validateDto({
      targetType: 'PERSONAL_SESSION',
      targetId: 1,
      rating: 5,
      comment: '   ',
    });
    expect(blankComment.errors).toHaveLength(0);
    expect(blankComment.dto.comment).toBeUndefined();
  });

  it.each([
    { targetType: 'CLASS', targetId: 1, rating: 0 },
    { targetType: 'CLASS', targetId: 1, rating: 6 },
    { targetType: 'CLASS', targetId: 1, rating: 4.5 },
    { targetType: 'CLASS', targetId: 1, rating: 5, comment: 'x'.repeat(501) },
    { targetType: 'MACHINE', targetId: 1, rating: 5 },
    { targetType: 'CLASS', targetId: 0, rating: 5 },
  ])('rechaza entrada inválida %j', async (payload) => {
    const { errors } = await validateDto(payload);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ReviewsService (H22)', () => {
  function build() {
    const reviewRepository = {
      findPendingTargets: vi.fn().mockResolvedValue([]),
      findByMember: vi.fn().mockResolvedValue([]),
      createReview: vi.fn(),
    };
    const service = new ReviewsService(
      reviewRepository as unknown as ReviewRepository,
    );
    return { service, reviewRepository };
  }

  it('delegates listPending y listMine al repositorio con la identidad del miembro', async () => {
    const { service, reviewRepository } = build();
    const now = new Date('2026-11-20T18:00:00.000Z');
    await service.listPending(MEMBER_ID, now);
    await service.listMine(MEMBER_ID);
    expect(reviewRepository.findPendingTargets).toHaveBeenCalledWith(MEMBER_ID, now);
    expect(reviewRepository.findByMember).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('crea reseña convirtiendo comment omitido en null', async () => {
    const { service, reviewRepository } = build();
    const now = new Date('2026-11-20T18:00:00.000Z');
    const saved = {
      id: 1,
      targetType: 'CLASS' as const,
      targetId: 7,
      title: 'Yoga',
      trainerId: 't1',
      trainerName: 'Entrenador',
      rating: 5,
      comment: null,
      createdAt: now,
    };
    reviewRepository.createReview.mockResolvedValue(saved);

    const res = await service.create(
      MEMBER_ID,
      { targetType: 'CLASS', targetId: 7, rating: 5 },
      now,
    );
    expect(res).toEqual(saved);
    expect(reviewRepository.createReview).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      targetType: 'CLASS',
      targetId: 7,
      rating: 5,
      comment: null,
      now,
    });
  });

  it('traduce ReviewTargetNotFoundError a 404', async () => {
    const { service, reviewRepository } = build();
    reviewRepository.createReview.mockRejectedValue(
      new ReviewTargetNotFoundError('No encontramos esa clase.'),
    );
    await expect(
      service.create(MEMBER_ID, { targetType: 'CLASS', targetId: 99, rating: 4 }),
    ).rejects.toThrow(new NotFoundException('No encontramos esa clase.'));
  });

  it.each([
    [new DuplicateReviewError(), 'Ya calificaste esta clase o sesión.'],
    [new ReviewNotAllowedError(SESSION_COMPLETED_REQUIRED_MESSAGE), SESSION_COMPLETED_REQUIRED_MESSAGE],
    [new ReviewNotAllowedError(CLASS_ATTENDANCE_REQUIRED_MESSAGE), CLASS_ATTENDANCE_REQUIRED_MESSAGE],
    [new ReviewNotAllowedError(REVIEW_WINDOW_EXPIRED_MESSAGE), REVIEW_WINDOW_EXPIRED_MESSAGE],
  ])('traduce errores de negocio a 409 (%s)', async (domainError, message) => {
    const { service, reviewRepository } = build();
    reviewRepository.createReview.mockRejectedValue(domainError);
    await expect(
      service.create(MEMBER_ID, { targetType: 'CLASS', targetId: 1, rating: 4 }),
    ).rejects.toThrow(new ConflictException(message));
  });
});
