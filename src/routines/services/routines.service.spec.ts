import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoutineDto } from '@Routines/dto';
import {
  RoutineForbiddenError,
  RoutineMemberNotFoundError,
  RoutineNotFoundError,
} from '@Routines/errors';
import type { RoutineRepository } from '@Routines/repositories';
import {
  EMPTY_ROUTINE_UPDATE_MESSAGE,
  RoutinesService,
} from '@Routines/services';

const TRAINER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

const validExercise = (overrides: object = {}) => ({
  name: 'Sentadilla',
  sets: 4,
  reps: 10,
  suggestedWeightKg: 60,
  ...overrides,
});

const validPayload = (overrides: object = {}) => ({
  name: 'Rutina Fuerza',
  memberId: MEMBER_ID,
  daysOfWeek: [1, 3, 5],
  exercises: [validExercise()],
  ...overrides,
});

describe('CreateRoutineDto validación (BE-18.1)', () => {
  const validateDto = async (payload: object) => {
    const dto = plainToInstance(CreateRoutineDto, payload);
    return { dto, errors: await validate(dto) };
  };

  it('acepta límites exactos de nombre, días, ejercicios, series, repeticiones y peso', async () => {
    const maxExercises = Array.from({ length: 15 }, (_, i) =>
      validExercise({ name: `Ejercicio ${i + 1}`, sets: 10, reps: 50, suggestedWeightKg: 300 }),
    );
    const { errors } = await validateDto(
      validPayload({
        name: 'A'.repeat(60),
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        exercises: maxExercises,
      }),
    );
    expect(errors).toHaveLength(0);

    const minRes = await validateDto(
      validPayload({
        name: 'Abc',
        daysOfWeek: [7],
        exercises: [validExercise({ sets: 1, reps: 1, suggestedWeightKg: 0 })],
      }),
    );
    expect(minRes.errors).toHaveLength(0);
  });

  it.each([
    ['nombre < 3', validPayload({ name: 'Ab' })],
    ['nombre > 60', validPayload({ name: 'x'.repeat(61) })],
    ['0 días', validPayload({ daysOfWeek: [] })],
    ['8 días', validPayload({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7, 1] })],
    ['días duplicados', validPayload({ daysOfWeek: [1, 1] })],
    ['día fuera de 1..7', validPayload({ daysOfWeek: [0] })],
    ['día > 7', validPayload({ daysOfWeek: [8] })],
    ['0 ejercicios', validPayload({ exercises: [] })],
    [
      '16 ejercicios',
      validPayload({
        exercises: Array.from({ length: 16 }, () => validExercise()),
      }),
    ],
    ['0 series', validPayload({ exercises: [validExercise({ sets: 0 })] })],
    ['11 series', validPayload({ exercises: [validExercise({ sets: 11 })] })],
    ['0 repeticiones', validPayload({ exercises: [validExercise({ reps: 0 })] })],
    ['51 repeticiones', validPayload({ exercises: [validExercise({ reps: 51 })] })],
    ['peso negativo', validPayload({ exercises: [validExercise({ suggestedWeightKg: -0.5 })] })],
    ['peso > 300', validPayload({ exercises: [validExercise({ suggestedWeightKg: 300.01 })] })],
  ])('rechaza %s', async (_label, payload) => {
    const { errors } = await validateDto(payload);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('RoutinesService (H18)', () => {
  function build() {
    const routineRepository = {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      findByMember: vi.fn().mockResolvedValue([]),
      findByTrainer: vi.fn().mockResolvedValue([]),
    };
    const service = new RoutinesService(
      routineRepository as unknown as RoutineRepository,
    );
    return { service, routineRepository };
  }

  it('traduce RoutineForbiddenError a 403 al editar rutina de otro entrenador', async () => {
    const { service, routineRepository } = build();
    routineRepository.update.mockRejectedValue(new RoutineForbiddenError());

    await expect(
      service.update(5, TRAINER_ID, { name: 'Nuevo nombre' }),
    ).rejects.toThrow(
      new ForbiddenException('No puedes modificar una rutina de otro entrenador.'),
    );
  });

  it('traduce RoutineNotFoundError y RoutineMemberNotFoundError a 404', async () => {
    const { service, routineRepository } = build();
    routineRepository.update.mockRejectedValue(new RoutineNotFoundError());
    await expect(
      service.update(5, TRAINER_ID, { name: 'Nuevo' }),
    ).rejects.toThrow(new NotFoundException('No encontramos esa rutina.'));

    routineRepository.create.mockRejectedValue(new RoutineMemberNotFoundError());
    await expect(
      service.create(TRAINER_ID, validPayload() as CreateRoutineDto),
    ).rejects.toThrow(new NotFoundException('No encontramos ese miembro.'));
  });

  it('rechaza actualización vacía con 400 sin llamar al repositorio', async () => {
    const { service, routineRepository } = build();
    await expect(service.update(5, TRAINER_ID, {})).rejects.toThrow(
      new BadRequestException(EMPTY_ROUTINE_UPDATE_MESSAGE),
    );
    expect(routineRepository.update).not.toHaveBeenCalled();
  });

  it('listMine consulta únicamente el memberId del token', async () => {
    const { service, routineRepository } = build();
    await service.listMine(MEMBER_ID);
    expect(routineRepository.findByMember).toHaveBeenCalledWith(MEMBER_ID);
  });
});
