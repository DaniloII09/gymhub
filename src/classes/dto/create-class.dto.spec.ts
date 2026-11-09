import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CLASS_CAPACITY_RANGE_MESSAGE,
  CLASS_DURATION_RANGE_MESSAGE,
  CLASS_NAME_LENGTH_MESSAGE,
  CreateClassDto,
  ENDS_BEFORE_STARTS_MESSAGE,
  INVALID_TRAINER_UUID_MESSAGE,
  MISSING_CLASS_NAME_MESSAGE,
  PAST_STARTS_AT_MESSAGE,
} from '@Classes/dto';

const VALID_TRAINER_ID = '11111111-1111-4111-8111-111111111111';

function futureRange(durationMinutes = 60): { startsAt: string; endsAt: string } {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

async function fieldErrors(body: object, property: string): Promise<string[]> {
  const dto = plainToInstance(CreateClassDto, body);
  const errors = await validate(dto);
  const target = errors.find((error) => error.property === property);
  return Object.values(target?.constraints ?? {});
}

describe('CreateClassDto', () => {
  const validPayload = (overrides: object = {}) => ({
    name: 'Spinning Matutino',
    trainerId: VALID_TRAINER_ID,
    ...futureRange(50),
    capacity: 20,
    ...overrides,
  });

  it.each([
    ['ausente', { name: undefined }],
    ['vacío', { name: '' }],
    ['solo espacios', { name: '     ' }],
  ])('un nombre %s devuelve el mensaje de nombre obligatorio', async (_, override) => {
    await expect(
      fieldErrors(validPayload(override), 'name'),
    ).resolves.toEqual([MISSING_CLASS_NAME_MESSAGE]);
  });

  it.each([
    ['de 2 caracteres', 'ab'],
    ['de 61 caracteres', 'a'.repeat(61)],
  ])('un nombre %s devuelve el mensaje de longitud (3 a 60)', async (_, name) => {
    await expect(
      fieldErrors(validPayload({ name }), 'name'),
    ).resolves.toEqual([CLASS_NAME_LENGTH_MESSAGE]);
  });

  it.each([
    ['de 3 caracteres', 'Box'],
    ['de 60 caracteres', 'a'.repeat(60)],
  ])('acepta un nombre en el límite %s', async (_, name) => {
    await expect(fieldErrors(validPayload({ name }), 'name')).resolves.toEqual(
      [],
    );
  });

  it.each([0, 51, -5, 1.5])(
    'rechaza el cupo inválido %s',
    async (capacity) => {
      const errors = await fieldErrors(validPayload({ capacity }), 'capacity');
      expect(errors).toContain(CLASS_CAPACITY_RANGE_MESSAGE);
    },
  );

  it.each([1, 25, 50])('acepta el cupo válido %s', async (capacity) => {
    await expect(
      fieldErrors(validPayload({ capacity }), 'capacity'),
    ).resolves.toEqual([]);
  });

  it('rechaza una fecha de inicio en el pasado', async () => {
    const pastStart = new Date(Date.now() - 60 * 60_000);
    const pastEnd = new Date(pastStart.getTime() + 60 * 60_000);
    await expect(
      fieldErrors(
        validPayload({
          startsAt: pastStart.toISOString(),
          endsAt: pastEnd.toISOString(),
        }),
        'startsAt',
      ),
    ).resolves.toEqual([PAST_STARTS_AT_MESSAGE]);
  });

  it('rechaza endsAt igual o anterior a startsAt', async () => {
    const { startsAt } = futureRange(60);
    await expect(
      fieldErrors(validPayload({ startsAt, endsAt: startsAt }), 'endsAt'),
    ).resolves.toEqual([ENDS_BEFORE_STARTS_MESSAGE]);
  });

  it.each([29, 181])(
    'rechaza una duración de %s minutos (fuera de 30 a 180)',
    async (durationMinutes) => {
      await expect(
        fieldErrors(validPayload(futureRange(durationMinutes)), 'endsAt'),
      ).resolves.toEqual([CLASS_DURATION_RANGE_MESSAGE]);
    },
  );

  it.each([30, 180])(
    'acepta una duración límite de %s minutos',
    async (durationMinutes) => {
      await expect(
        fieldErrors(validPayload(futureRange(durationMinutes)), 'endsAt'),
      ).resolves.toEqual([]);
    },
  );

  it('rechaza un trainerId que no sea UUID', async () => {
    await expect(
      fieldErrors(validPayload({ trainerId: 'no-es-uuid' }), 'trainerId'),
    ).resolves.toEqual([INVALID_TRAINER_UUID_MESSAGE]);
  });
});

