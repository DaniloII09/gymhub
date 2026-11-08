import { NotFoundException } from '@nestjs/common';
import { ChargesService, MEMBER_NOT_FOUND_MESSAGE } from '@Payments/services';
import { InvalidChargeError } from '@Payments/errors';
import type { ChargeRepository } from '@Payments/repositories';
import type { Prisma } from '@PrismaClient';

const MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const tx = {} as Prisma.TransactionClient;

describe('ChargesService', () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findByMember: ReturnType<typeof vi.fn>;
    memberExists: ReturnType<typeof vi.fn>;
    searchMembers: ReturnType<typeof vi.fn>;
  };
  let service: ChargesService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findByMember: vi.fn(),
      memberExists: vi.fn(),
      searchMembers: vi.fn(),
    };
    service = new ChargesService(repository as unknown as ChargeRepository);
  });

  const input = (overrides: object = {}) => ({
    memberId: MEMBER_ID,
    type: 'MEMBERSHIP' as const,
    concept: 'Membresía Mensual',
    amount: 25,
    dueDate: new Date('2026-11-30'),
    ...overrides,
  });

  describe('createPending', () => {
    it('crea el cobro con la transacción de quien llama y devuelve su id', async () => {
      repository.create.mockResolvedValue({ id: 7 });

      await expect(service.createPending(input(), tx)).resolves.toEqual({
        chargeId: 7,
      });
      expect(repository.create).toHaveBeenCalledWith(input(), tx);
    });

    it.each([0, -5, Number.NaN])('rechaza el monto %s', async (amount) => {
      await expect(
        service.createPending(input({ amount }), tx),
      ).rejects.toBeInstanceOf(InvalidChargeError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un concepto vacío o de más de 80 caracteres', async () => {
      await expect(
        service.createPending(input({ concept: '   ' }), tx),
      ).rejects.toBeInstanceOf(InvalidChargeError);
      await expect(
        service.createPending(input({ concept: 'x'.repeat(81) }), tx),
      ).rejects.toBeInstanceOf(InvalidChargeError);
    });
  });

  describe('listByMember', () => {
    it('responde 404 si el miembro no existe', async () => {
      repository.memberExists.mockResolvedValue(false);

      await expect(service.listByMember(MEMBER_ID)).rejects.toThrow(
        new NotFoundException(MEMBER_NOT_FOUND_MESSAGE),
      );
      expect(repository.findByMember).not.toHaveBeenCalled();
    });

    it('pasa el filtro de estado al repositorio', async () => {
      repository.memberExists.mockResolvedValue(true);
      repository.findByMember.mockResolvedValue([]);

      await service.listByMember(MEMBER_ID, 'PENDING');

      expect(repository.findByMember).toHaveBeenCalledWith(
        MEMBER_ID,
        'PENDING',
      );
    });
  });
});
