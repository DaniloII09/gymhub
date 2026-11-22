import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@PrismaClient';
import { ProgressController } from '@Routines/controllers';
import {
  CreateProgressEntryDto,
  PROGRESS_ARM_MESSAGE,
  PROGRESS_CHEST_MESSAGE,
  PROGRESS_WAIST_MESSAGE,
  PROGRESS_WEIGHT_MESSAGE,
} from '@Routines/dto';
import { ProgressRepository } from '@Routines/repositories';
import { FUTURE_DATE_MESSAGE, ProgressService } from '@Routines/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

// 19 nov 2026 a mediodía en El Salvador.
const NOW = new Date('2026-11-19T18:00:00.000Z');
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_MEMBER_ID = '33333333-3333-4333-8333-333333333333';

const entry = (overrides: object = {}) => ({
  date: '2026-10-01',
  weightKg: 80,
  chestCm: 98.5,
  waistCm: 84,
  armCm: 34.5,
  ...overrides,
});

/** Repositorio real con una base en memoria que respeta el único (miembro, fecha). */
function fixture() {
  const rows: Record<string, unknown>[] = [];
  const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    (a.recordedAt as Date).getTime() - (b.recordedAt as Date).getTime() ||
    (a.id as number) - (b.id as number);
  const tx = {
    progressEntry: {
      create: vi.fn(async ({ data }) => {
        const clash = rows.some(
          (r) =>
            r.memberId === data.memberId &&
            (r.recordedAt as Date).getTime() === data.recordedAt.getTime(),
        );
        if (clash) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: 'test',
            },
          );
        }
        const row = {
          id: rows.length + 1,
          createdAt: NOW,
          updatedAt: NOW,
          ...data,
        };
        rows.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }) =>
          rows.filter((r) => r.memberId === where.memberId).sort(byDate)[0] ??
          null,
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    progressEntry: {
      findMany: vi.fn(async ({ where }) =>
        rows.filter((r) => r.memberId === where.memberId).sort(byDate),
      ),
    },
  };
  return {
    rows,
    prisma,
    service: new ProgressService(new ProgressRepository(prisma as never)),
  };
}

const messagesOf = async (plain: object) =>
  (await validate(plainToInstance(CreateProgressEntryDto, plain))).flatMap(
    (e) => Object.values(e.constraints ?? {}),
  );

describe('H19. Registrar mi progreso y ver mi evolución', () => {
  it('AC1: un registro válido queda en mi historial y el primero es el punto de partida', async () => {
    expect(
      await messagesOf(
        entry({ weightKg: 20, chestCm: 10, waistCm: 250, armCm: 10 }),
      ),
    ).toEqual([]);
    expect(await messagesOf(entry({ weightKg: 300 }))).toEqual([]);

    const { service } = fixture();
    const first = await service.create(MEMBER_ID, entry(), NOW);
    const second = await service.create(
      MEMBER_ID,
      entry({ date: '2026-11-19', weightKg: 76.5 }),
      NOW,
    );

    expect(first.isBaseline).toBe(true);
    expect(second.isBaseline).toBe(false);
    const history = await service.getEvolution(MEMBER_ID);
    expect(history.entries.map((e) => [e.date, e.isBaseline])).toEqual([
      ['2026-10-01', true],
      ['2026-11-19', false],
    ]);
  });

  it('AC2: un valor fuera de rango o una fecha futura no se guardan y se dice qué corregir', async () => {
    expect(
      await messagesOf(
        entry({ weightKg: 19.9, chestCm: 9, waistCm: 251, armCm: 300 }),
      ),
    ).toEqual([
      PROGRESS_WEIGHT_MESSAGE,
      PROGRESS_CHEST_MESSAGE,
      PROGRESS_WAIST_MESSAGE,
      PROGRESS_ARM_MESSAGE,
    ]);
    expect(PROGRESS_WEIGHT_MESSAGE).toBe(
      'El peso debe estar entre 20 y 300 kg.',
    );

    const { service, rows } = fixture();
    await expect(
      service.create(MEMBER_ID, entry({ date: '2026-11-20' }), NOW),
    ).rejects.toThrow(new BadRequestException(FUTURE_DATE_MESSAGE));
    await expect(
      service.create(MEMBER_ID, entry({ date: '2026-02-30' }), NOW),
    ).rejects.toThrow(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('AC3: otro registro con la misma fecha muestra "Ya tienes un registro en esa fecha."', async () => {
    const { service, rows } = fixture();
    await service.create(MEMBER_ID, entry(), NOW);

    await expect(
      service.create(MEMBER_ID, entry({ weightKg: 79 }), NOW),
    ).rejects.toThrow(
      new ConflictException('Ya tienes un registro en esa fecha.'),
    );
    expect(rows).toHaveLength(1);
  });

  it('AC4: con dos o más registros devuelve la serie para la gráfica y la diferencia contra el punto de partida', async () => {
    const { service } = fixture();
    await service.create(
      MEMBER_ID,
      entry({
        date: '2026-11-15',
        weightKg: 77,
        chestCm: 100,
        waistCm: 81,
        armCm: 35,
      }),
      NOW,
    );
    await service.create(MEMBER_ID, entry(), NOW);
    await service.create(
      MEMBER_ID,
      entry({
        date: '2026-11-19',
        weightKg: 76.5,
        chestCm: 100,
        waistCm: 81,
        armCm: 35,
      }),
      NOW,
    );

    const evolution = await service.getEvolution(MEMBER_ID);

    expect(evolution.entries.map((e) => e.weightKg)).toEqual([80, 77, 76.5]);
    expect(evolution.deltas).toEqual({
      weightKg: -3.5,
      chestCm: 1.5,
      waistCm: -3,
      armCm: 0.5,
    });
  });

  it('AC5: otro miembro no puede ver mi progreso', async () => {
    const { service, prisma } = fixture();
    await service.create(MEMBER_ID, entry(), NOW);

    expect((await service.getEvolution(OTHER_MEMBER_ID)).entries).toEqual([]);
    expect(prisma.progressEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { memberId: OTHER_MEMBER_ID } }),
    );
    // La API solo expone /progress/me: el miembro sale del token, no de la URL.
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ProgressController.prototype.getEvolution,
      ),
    ).toBe('me');
    expect(rolesAllowed(ProgressController, 'getEvolution')).toEqual([
      'MEMBER',
    ]);
    // Editar un registro ajeno responde como si no existiera.
    await expect(
      service.updateMine(1, OTHER_MEMBER_ID, { weightKg: 70 }, NOW),
    ).rejects.toThrow(NotFoundException);
  });
});
