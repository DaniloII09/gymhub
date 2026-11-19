import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePlanDto,
  DROP_IN_DURATION_MESSAGE,
  ListPlansQueryDto,
  PLAN_BENEFITS_MESSAGE,
  PLAN_DURATION_MESSAGE,
  PLAN_NAME_MESSAGE,
  PLAN_PRICE_MESSAGE,
  UpdatePlanDto,
} from '@Memberships/dto';

type DtoClass = typeof CreatePlanDto | typeof UpdatePlanDto | typeof ListPlansQueryDto;

async function errorsOf(cls: DtoClass, body: object): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(cls as typeof CreatePlanDto, body));
  return Object.fromEntries(
    errors.map((error) => [error.property, Object.values(error.constraints ?? {})]),
  );
}

const monthly = (overrides: object = {}) => ({
  name: 'Mensual Plus',
  type: 'MONTHLY',
  durationDays: 30,
  price: 25,
  benefits: 'Acceso ilimitado',
  ...overrides,
});

describe('CreatePlanDto (BE-3.1)', () => {
  it('acepta un plan Mensual válido', async () => {
    expect(await errorsOf(CreatePlanDto, monthly())).toEqual({});
  });

  it('acepta un DROP_IN sin duración y sin beneficios', async () => {
    expect(
      await errorsOf(CreatePlanDto, { name: 'Clase suelta', type: 'DROP_IN', price: 5 }),
    ).toEqual({});
  });

  it('recorta el nombre antes de validar', async () => {
    const dto = plainToInstance(CreatePlanDto, monthly({ name: '  Mensual  ' }));
    expect(dto.name).toBe('Mensual');
  });

  it.each([['Ab'], ['a'.repeat(41)], ['   ']])('rechaza el nombre %#', async (name) => {
    expect((await errorsOf(CreatePlanDto, monthly({ name }))).name).toEqual([PLAN_NAME_MESSAGE]);
  });

  it('acepta nombres de 3 y 40 caracteres', async () => {
    expect(await errorsOf(CreatePlanDto, monthly({ name: 'Abc' }))).toEqual({});
    expect(await errorsOf(CreatePlanDto, monthly({ name: 'a'.repeat(40) }))).toEqual({});
  });

  it('rechaza un tipo desconocido', async () => {
    expect((await errorsOf(CreatePlanDto, monthly({ type: 'ANUAL' }))).type).toBeDefined();
  });

  it.each([[0], [366], [1.5], [undefined], [null], ['30']])(
    'en MONTHLY rechaza la duración %s con un solo mensaje',
    async (durationDays) => {
      expect((await errorsOf(CreatePlanDto, monthly({ durationDays }))).durationDays).toEqual([
        PLAN_DURATION_MESSAGE,
      ]);
    },
  );

  it('acepta duraciones de 1 y 365 días', async () => {
    expect(await errorsOf(CreatePlanDto, monthly({ durationDays: 1 }))).toEqual({});
    expect(
      await errorsOf(CreatePlanDto, monthly({ type: 'QUARTERLY', durationDays: 365 })),
    ).toEqual({});
  });

  it('rechaza una duración enviada en DROP_IN', async () => {
    expect(
      (await errorsOf(CreatePlanDto, { name: 'Suelta', type: 'DROP_IN', price: 5, durationDays: 1 }))
        .durationDays,
    ).toEqual([DROP_IN_DURATION_MESSAGE]);
  });

  it.each([[0], [-1], [25.555], [1_000_000], ['25']])('rechaza el precio %s', async (price) => {
    expect((await errorsOf(CreatePlanDto, monthly({ price }))).price).toContain(
      PLAN_PRICE_MESSAGE,
    );
  });

  it('acepta un precio de $0.01 con 2 decimales', async () => {
    expect(await errorsOf(CreatePlanDto, monthly({ price: 0.01 }))).toEqual({});
  });

  it('rechaza beneficios de más de 300 caracteres y acepta 300', async () => {
    expect((await errorsOf(CreatePlanDto, monthly({ benefits: 'b'.repeat(301) }))).benefits).toEqual(
      [PLAN_BENEFITS_MESSAGE],
    );
    expect(await errorsOf(CreatePlanDto, monthly({ benefits: 'b'.repeat(300) }))).toEqual({});
  });
});

describe('UpdatePlanDto (BE-3.1)', () => {
  it('acepta un cuerpo vacío y campos sueltos', async () => {
    expect(await errorsOf(UpdatePlanDto, {})).toEqual({});
    expect(await errorsOf(UpdatePlanDto, { price: 30 })).toEqual({});
    expect(await errorsOf(UpdatePlanDto, { benefits: null })).toEqual({});
  });

  it('valida los campos enviados', async () => {
    const errors = await errorsOf(UpdatePlanDto, { name: 'Ab', durationDays: 0, price: 0 });
    expect(errors.name).toEqual([PLAN_NAME_MESSAGE]);
    expect(errors.durationDays).toEqual(expect.arrayContaining([PLAN_DURATION_MESSAGE]));
    expect(errors.price).toContain(PLAN_PRICE_MESSAGE);
  });

  it('null en nombre, duración o precio no se toma como "sin cambio"', async () => {
    const errors = await errorsOf(UpdatePlanDto, { name: null, durationDays: null, price: null });
    expect(Object.keys(errors).sort()).toEqual(['durationDays', 'name', 'price']);
  });
});

describe('ListPlansQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('convierte active=%s', async (active, expected) => {
    expect(plainToInstance(ListPlansQueryDto, { active }).active).toBe(expected);
    expect(await errorsOf(ListPlansQueryDto, { active })).toEqual({});
  });

  it('rechaza un valor que no es true ni false', async () => {
    expect((await errorsOf(ListPlansQueryDto, { active: 'si' })).active).toBeDefined();
  });
});
