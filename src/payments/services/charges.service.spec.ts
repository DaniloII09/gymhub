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
    findPending: ReturnType<typeof vi.fn>;
    memberExists: ReturnType<typeof vi.fn>;
    searchMembers: ReturnType<typeof vi.fn>;
  };
  let service: ChargesService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findByMember: vi.fn(),
      findPending: vi.fn(),
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

  describe('listMine (H16)', () => {
    it('devuelve los cobros del miembro del token sin pasar por la búsqueda de miembro', async () => {
      repository.findByMember.mockResolvedValue([{ id: 1 }]);

      await expect(service.listMine(MEMBER_ID, 'PENDING')).resolves.toEqual([
        { id: 1 },
      ]);
      expect(repository.findByMember).toHaveBeenCalledWith(
        MEMBER_ID,
        'PENDING',
      );
      expect(repository.memberExists).not.toHaveBeenCalled();
    });
  });

  describe('listPending (H17)', () => {
    const row = {
      id: 4,
      memberCode: 'GYM-000002',
      fullName: 'Ana Gomez',
      concept: 'Sesión personal',
      amount: 15,
      dueDate: new Date('2026-11-06'),
      daysLate: 6,
    };

    it('pasa el filtro y la fecha de hoy del gimnasio, y arma la página con el total adeudado', async () => {
      repository.findPending.mockResolvedValue({
        rows: [row],
        total: 3,
        totalOwed: 55.1 + 0.2,
      });

      const result = await service.listPending(
        { type: 'PERSONAL_SESSION', page: 1, pageSize: 20 },
        new Date('2026-11-13T01:00:00Z'),
      );

      expect(repository.findPending).toHaveBeenCalledWith(
        { type: 'PERSONAL_SESSION', today: '2026-11-12' },
        { type: 'PERSONAL_SESSION', page: 1, pageSize: 20 },
      );
      expect(result).toEqual({
        data: [row],
        total: 3,
        page: 1,
        pageSize: 20,
        // 55.1 + 0.2 da 55.300000000000004 en coma flotante.
        totalOwed: 55.3,
      });
    });

    it('sin pendientes devuelve una lista vacía y total adeudado 0', async () => {
      repository.findPending.mockResolvedValue({
        rows: [],
        total: 0,
        totalOwed: 0,
      });

      await expect(
        service.listPending({ page: 1, pageSize: 20 }),
      ).resolves.toEqual({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalOwed: 0,
      });
    });
  });
});
