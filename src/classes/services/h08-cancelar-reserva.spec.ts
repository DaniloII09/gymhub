import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassResponseDto } from '@Classes/dto';
import { ClassReservationRepository } from '@Classes/repositories';
import { ClassReservationsService } from './class-reservations.service.js';
import type { MembershipEligibilityService } from './membership-eligibility.service.js';

const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-21T12:00:00Z');
const HOUR = 60 * 60_000;

/** Repositorio real con una transacción simulada sobre una reserva. */
function build(
  reservation: { memberId: string; origin: string; startsIn: number } | null,
) {
  const stored = reservation && {
    id: 10,
    classId: 1,
    memberId: reservation.memberId,
    status: 'CONFIRMED',
    origin: reservation.origin,
    gymClass: {
      id: 1,
      name: 'Funcional QA',
      trainer: { id: 't-1', fullName: 'Entrenador Demo', email: 'e@x' },
      capacity: 3,
      startsAt: new Date(NOW.getTime() + reservation.startsIn),
      endsAt: new Date(NOW.getTime() + reservation.startsIn + HOUR),
    },
  };
  const tx = {
    $queryRaw: vi.fn(),
    classReservation: {
      // Solo encuentra la reserva si es del miembro que la pide.
      findFirst: vi.fn(async ({ where }) =>
        stored && where.memberId === stored.memberId ? stored : null,
      ),
      update: vi.fn(async ({ data }) => ({ ...stored, ...data })),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const repository = new ClassReservationRepository(prisma as never);
  const original = repository.cancelMine.bind(repository);
  vi.spyOn(repository, 'cancelMine').mockImplementation((id, member) =>
    original(id, member, NOW),
  );
  const service = new ClassReservationsService(
    repository,
    {} as MembershipEligibilityService,
  );
  return { service, tx };
}

describe('H08. Cancelar mi reserva', () => {
  it('AC1: con 2 horas o más de anticipación la reserva pasa a Cancelada y el cupo sube en 1', async () => {
    const { service, tx } = build({
      memberId: MEMBER_ID,
      origin: 'MEMBERSHIP',
      startsIn: 3 * HOUR,
    });

    const cancelled = await service.cancelMine(10, MEMBER_ID);

    expect(cancelled.status).toBe('CANCELLED');
    expect(tx.classReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    // Antes tenía 2 confirmadas de 3 (1 libre); ahora 1 confirmada: 2 libres.
    expect(
      ClassResponseDto.fromEntity(cancelled.gymClass as never).spotsLeft,
    ).toBe(2);
  });

  it('AC2: con menos de 2 horas no deja cancelar: "Solo puedes cancelar hasta 2 horas antes de la clase."', async () => {
    const { service, tx } = build({
      memberId: MEMBER_ID,
      origin: 'MEMBERSHIP',
      startsIn: 90 * 60_000,
    });

    const attempt = service.cancelMine(10, MEMBER_ID);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'Solo puedes cancelar hasta 2 horas antes de la clase.',
    );
    expect(tx.classReservation.update).not.toHaveBeenCalled();
  });

  it('AC3: una reserva de clase suelta no se cancela: "La clase suelta no se puede cancelar."', async () => {
    const { service, tx } = build({
      memberId: MEMBER_ID,
      origin: 'DROP_IN',
      startsIn: 5 * HOUR,
    });

    const attempt = service.cancelMine(10, MEMBER_ID);

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'La clase suelta no se puede cancelar.',
    );
    expect(tx.classReservation.update).not.toHaveBeenCalled();
  });

  it('AC4: no deja cancelar la reserva de otro miembro', async () => {
    const { service, tx } = build({
      memberId: 'otro-miembro',
      origin: 'MEMBERSHIP',
      startsIn: 5 * HOUR,
    });

    await expect(service.cancelMine(10, MEMBER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.classReservation.update).not.toHaveBeenCalled();
  });
});
