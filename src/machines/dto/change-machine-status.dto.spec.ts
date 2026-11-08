import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ChangeMachineStatusDto,
  MISSING_REASON_MESSAGE,
  REASON_LENGTH_MESSAGE,
} from '@Machines/dto';

async function reasonErrors(body: object): Promise<string[]> {
  const dto = plainToInstance(ChangeMachineStatusDto, body);
  const errors = await validate(dto);
  const reason = errors.find((error) => error.property === 'reason');
  return Object.values(reason?.constraints ?? {});
}

describe('ChangeMachineStatusDto', () => {
  const status = 'UNDER_MAINTENANCE';

  it.each([
    ['ausente', { status }],
    ['vacío', { status, reason: '' }],
    ['de puros espacios', { status, reason: '     ' }],
  ])(
    'un motivo %s da solo "Escribe el motivo del cambio."',
    async (_, body) => {
      await expect(reasonErrors(body)).resolves.toEqual([
        MISSING_REASON_MESSAGE,
      ]);
    },
  );

  it.each([
    ['de 4 caracteres', 'abcd'],
    ['de 201 caracteres', 'a'.repeat(201)],
  ])('un motivo %s da el mensaje de longitud', async (_, reason) => {
    await expect(reasonErrors({ status, reason })).resolves.toEqual([
      REASON_LENGTH_MESSAGE,
    ]);
  });

  it.each([
    ['de 5 caracteres', 'abcde'],
    ['de 200 caracteres', 'a'.repeat(200)],
  ])('acepta un motivo %s', async (_, reason) => {
    await expect(reasonErrors({ status, reason })).resolves.toEqual([]);
  });

  it('rechaza un estado que no existe', async () => {
    const dto = plainToInstance(ChangeMachineStatusDto, {
      status: 'ROTA',
      reason: 'No enciende',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(['status']);
  });
});
