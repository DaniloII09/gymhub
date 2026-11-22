import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { RoutinesController } from '@Routines/controllers';
import {
  CreateRoutineDto,
  EXERCISE_REPS_MESSAGE,
  EXERCISE_SETS_MESSAGE,
  EXERCISE_WEIGHT_MESSAGE,
} from '@Routines/dto';
import { RoutineRepository } from '@Routines/repositories';
import { RoutinesService } from '@Routines/services';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const TRAINER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_TRAINER_ID = '55555555-5555-4555-8555-555555555555';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const exercise = (overrides: object = {}) => ({
  name: 'Sentadilla',
  sets: 4,
  reps: 10,
  suggestedWeightKg: 60,
  ...overrides,
});
const body = (overrides: object = {}) => ({
  name: 'Hipertrofia Tren Inferior',
  memberId: MEMBER_ID,
  daysOfWeek: [5, 1, 3],
  exercises: [exercise()],
  ...overrides,
});

/** Errores de validación de la rutina, aplanados con su ruta (exercises.1.sets). */
async function errorsOf(plain: object): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const walk = (errors: ValidationError[], prefix: string) => {
    for (const e of errors) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) out[path] = Object.values(e.constraints);
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(await validate(plainToInstance(CreateRoutineDto, plain)), '');
  return out;
}

/** Repositorio real con una base en memoria de rutinas. */
function fixture() {
  const routines: Record<string, unknown>[] = [];
  const withRelations = (r: Record<string, unknown>) => ({
    ...r,
    trainer: { id: r.trainerId, fullName: 'Entrenador' },
    member: {
      id: r.memberId,
      fullName: 'Juan Perez',
      memberCode: 'GYM-000001',
    },
    exercises: ((r.exercises as { create: object[] })?.create ?? []).map(
      (ex, i) => ({ id: i + 1, ...ex }),
    ),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const tx = {
    user: { count: vi.fn().mockResolvedValue(1) },
    routine: {
      create: vi.fn(async ({ data }) => {
        const r = { id: routines.length + 1, ...data };
        routines.push(r);
        return withRelations(r);
      }),
      findUnique: vi.fn(
        async ({ where }) => routines.find((r) => r.id === where.id) ?? null,
      ),
      update: vi.fn(),
    },
    routineExercise: { deleteMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    routine: {
      findMany: vi.fn(async ({ where }) =>
        routines
          .filter((r) => r.memberId === where.memberId)
          .map(withRelations),
      ),
    },
  };
  const service = new RoutinesService(new RoutineRepository(prisma as never));
  return { routines, tx, prisma, service };
}

describe('H18. Asignar una rutina a un miembro', () => {
  it('AC1: una rutina válida se guarda y aparece en "Mi rutina" del miembro', async () => {
    expect(await errorsOf(body())).toEqual({});
    // Límites aceptados: 60 caracteres, 7 días, 15 ejercicios, 10 series, 50 reps, 0 y 300 kg.
    expect(
      await errorsOf(
        body({
          name: 'x'.repeat(60),
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          exercises: Array.from({ length: 15 }, (_, i) =>
            exercise({
              sets: 10,
              reps: 50,
              suggestedWeightKg: i % 2 ? 300 : 0,
            }),
          ),
        }),
      ),
    ).toEqual({});

    const { service } = fixture();
    await service.create(TRAINER_ID, plainToInstance(CreateRoutineDto, body()));
    const mine = await service.listMine(MEMBER_ID);

    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      name: 'Hipertrofia Tren Inferior',
      daysOfWeek: [1, 3, 5],
      exercises: [
        {
          sortOrder: 1,
          name: 'Sentadilla',
          sets: 4,
          reps: 10,
          suggestedWeightKg: 60,
        },
      ],
    });
  });

  it('AC2: con 0 series, 0 repeticiones o peso fuera de 0 a 300 kg no se guarda y se marca el ejercicio', async () => {
    const errors = await errorsOf(
      body({
        exercises: [
          exercise(),
          exercise({ sets: 0 }),
          exercise({ reps: 0 }),
          exercise({ suggestedWeightKg: 300.5 }),
          exercise({ suggestedWeightKg: -1 }),
        ],
      }),
    );

    expect(errors).toEqual({
      'exercises.1.sets': [EXERCISE_SETS_MESSAGE],
      'exercises.2.reps': [EXERCISE_REPS_MESSAGE],
      'exercises.3.suggestedWeightKg': [EXERCISE_WEIGHT_MESSAGE],
      'exercises.4.suggestedWeightKg': [EXERCISE_WEIGHT_MESSAGE],
    });
    // El primer ejercicio, válido, no se marca.
    expect(Object.keys(errors).some((k) => k.startsWith('exercises.0'))).toBe(
      false,
    );
  });

  it('AC3: no puedo editar una rutina creada por otro entrenador', async () => {
    const { service, tx } = fixture();
    const routine = await service.create(
      OTHER_TRAINER_ID,
      plainToInstance(CreateRoutineDto, body()),
    );

    await expect(
      service.update(routine.id, TRAINER_ID, { name: 'Cambio' }),
    ).rejects.toThrow(
      new ForbiddenException(
        'No puedes modificar una rutina de otro entrenador.',
      ),
    );
    expect(tx.routine.update).not.toHaveBeenCalled();
  });

  it('AC4: en "Mi rutina" el miembro solo ve las rutinas asignadas a él', async () => {
    const { service, prisma } = fixture();
    await service.create(TRAINER_ID, plainToInstance(CreateRoutineDto, body()));
    await service.create(
      TRAINER_ID,
      plainToInstance(
        CreateRoutineDto,
        body({
          name: 'De otro',
          memberId: '66666666-6666-4666-8666-666666666666',
        }),
      ),
    );

    const mine = await service.listMine(MEMBER_ID);

    expect(mine.map((r) => r.name)).toEqual(['Hipertrofia Tren Inferior']);
    expect(prisma.routine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: MEMBER_ID } }),
    );
    expect(rolesAllowed(RoutinesController, 'listMine')).toEqual(['MEMBER']);
  });

  it('AC5: solo el Entrenador puede crear, editar o borrar rutinas', () => {
    expect(rolesAllowed(RoutinesController, 'create')).toEqual(['TRAINER']);
    expect(rolesAllowed(RoutinesController, 'update')).toEqual(['TRAINER']);
    expect(rolesAllowed(RoutinesController, 'remove')).toEqual(['TRAINER']);
  });
});
