import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type { CurrentMembership } from '@Common/contracts';
import { ClassResponseDto } from '@Classes/dto';
import { AlreadyReservedError, ClassFullError } from '@Classes/errors';
import type {
  ClassReservationRepository,
  ClassRepository,
} from '@Classes/repositories';
import { ClassReservationsService } from './class-reservations.service.js';
import { ClassesService } from './classes.service.js';
import { MembershipEligibilityService } from './membership-eligibility.service.js';

const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const activeMonthly: CurrentMembership = {
  status: 'ACTIVE',
  planName: 'Mensual',
  planType: 'MONTHLY',
  endDate: new Date('2026-12-30'),
  daysLeft: 30,
};

const gymClass = (o: object = {}) => ({
  id: 1,
  name: 'Funcional QA',
  trainerId: 't-1',
  trainer: { id: 't-1', fullName: 'Entrenador Demo', email: 'e@x' },
  startsAt: new Date('2026-12-01T00:00:00Z'),
  endsAt: new Date('2026-12-01T01:00:00Z'),
  capacity: 3,
  confirmedReservations: 1,
  status: 'SCHEDULED',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...o,
});

function build(membership: CurrentMembership = activeMonthly) {
  const moduleRef = {
    get: vi.fn(() => ({ currentFor: vi.fn().mockResolvedValue(membership) })),
  };
  const repository = { reserve: vi.fn(), findByMember: vi.fn() };
  const service = new ClassReservationsService(
    repository as unknown as ClassReservationRepository,
    new MembershipEligibilityService(moduleRef as unknown as ModuleRef),
  );
  return { service, repository };
}

describe('H07. Reservar un cupo en una clase', () => {
  it('AC1: el miembro ve las clases Programada de los próximos 7 días con horario, entrenador y cupos', async () => {
    const classRepository = {
      listByRange: vi.fn().mockResolvedValue([gymClass()]),
    };
    const classes = new ClassesService(
      classRepository as unknown as ClassRepository,
    );
    const from = new Date('2026-11-30T00:00:00Z');
    const to = new Date('2026-12-07T00:00:00Z');

    const [listed] = await classes.list({ from, to }, {
      role: 'MEMBER',
    } as never);
    const shown = ClassResponseDto.fromEntity(listed);

    expect(classRepository.listByRange).toHaveBeenCalledWith(
      from,
      to,
      'SCHEDULED',
    );
    expect(shown).toMatchObject({
      startsAt: listed.startsAt,
      endsAt: listed.endsAt,
      spotsLeft: 2,
    });
    expect(JSON.stringify(shown)).toContain('Entrenador Demo');
  });

  it('AC2: con cupo, la reserva queda Confirmada y los cupos bajan en 1', async () => {
    const { service, repository } = build();
    repository.reserve.mockResolvedValue({
      id: 10,
      status: 'CONFIRMED',
      gymClass: gymClass({ confirmedReservations: 2 }),
    });

    const reservation = await service.reserve(1, MEMBER_ID);

    expect(reservation.status).toBe('CONFIRMED');
    expect(
      ClassResponseDto.fromEntity(reservation.gymClass as never).spotsLeft,
    ).toBe(1);
  });

  it('AC3: con un solo cupo y dos reservas a la vez, solo una se confirma y la otra ve "La clase está llena."', async () => {
    const { service, repository } = build();
    repository.reserve
      .mockResolvedValueOnce({
        id: 11,
        status: 'CONFIRMED',
        gymClass: gymClass({ capacity: 1, confirmedReservations: 1 }),
      })
      .mockRejectedValueOnce(new ClassFullError(1));

    const [first, second] = await Promise.allSettled([
      service.reserve(1, MEMBER_ID),
      service.reserve(1, 'otro-miembro'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    const error = (second as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('La clase está llena.');
  });

  it('AC4: sin membresía Activa no deja reservar: "Necesitas una membresía activa para reservar."', async () => {
    for (const status of ['NONE', 'EXPIRED', 'PENDING_PAYMENT'] as const) {
      const { service, repository } = build({ ...activeMonthly, status });
      const attempt = service.reserve(1, MEMBER_ID);
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toThrow(
        'Necesitas una membresía activa para reservar.',
      );
      expect(repository.reserve).not.toHaveBeenCalled();
    }
  });

  it('AC5: con solo una clase suelta no deja reservar: "La clase suelta se compra en recepción y no permite reservar."', async () => {
    const { service } = build({
      ...activeMonthly,
      planName: 'Clase suelta',
      planType: 'DROP_IN',
    });

    await expect(service.reserve(1, MEMBER_ID)).rejects.toThrow(
      'La clase suelta se compra en recepción y no permite reservar.',
    );
  });

  it('AC6: con una reserva Confirmada en la clase no deja reservar otra: "Ya tienes una reserva en esta clase."', async () => {
    const { service, repository } = build();
    repository.reserve.mockRejectedValue(
      new AlreadyReservedError(1, MEMBER_ID),
    );

    const attempt = service.reserve(1, MEMBER_ID);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'Ya tienes una reserva en esta clase.',
    );
  });
});
