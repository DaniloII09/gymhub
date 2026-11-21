import { NotFoundException } from '@nestjs/common';
import { ReceiptsService } from '@Payments/services';
import type {
  ReceiptDetail,
  ReceiptRepository,
  ReceiptSummary,
} from '@Payments/repositories';

const MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_MEMBER_ID = '33333333-3333-3333-3333-333333333333';

const summary: ReceiptSummary = {
  id: 2,
  number: 'C-000002',
  issuedAt: new Date('2026-11-12T15:00:00Z'),
  concept: 'Membresía Mensual',
  amount: 25,
  method: 'CARD',
  cardLast4: '4242',
};

const detail: ReceiptDetail = {
  id: 2,
  number: 'C-000002',
  issuedAt: new Date('2026-11-12T15:00:00Z'),
  memberId: MEMBER_ID,
  memberEmail: 'miembro@gymhub.test',
  concept: 'Membresía Mensual',
  amount: 25,
  method: 'CARD',
  cardLast4: '4242',
};

describe('ReceiptsService', () => {
  let repository: {
    findByMember: ReturnType<typeof vi.fn>;
    findDetail: ReturnType<typeof vi.fn>;
  };
  let service: ReceiptsService;

  beforeEach(() => {
    repository = { findByMember: vi.fn(), findDetail: vi.fn() };
    service = new ReceiptsService(repository as unknown as ReceiptRepository);
  });

  describe('listMine (H16)', () => {
    it('arma la página con los comprobantes del miembro y el total', async () => {
      repository.findByMember.mockResolvedValue({ rows: [summary], total: 21 });

      await expect(
        service.listMine(MEMBER_ID, { page: 2, pageSize: 20 }),
      ).resolves.toEqual({ data: [summary], total: 21, page: 2, pageSize: 20 });
      expect(repository.findByMember).toHaveBeenCalledWith(MEMBER_ID, {
        page: 2,
        pageSize: 20,
      });
    });
  });

  describe('getPdf', () => {
    it('el miembro dueño recibe su PDF', async () => {
      repository.findDetail.mockResolvedValue(detail);

      const result = await service.getPdf(2, { id: MEMBER_ID, role: 'MEMBER' });

      expect(result.number).toBe('C-000002');
      expect(result.pdf.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('otro miembro recibe 404, igual que si no existiera', async () => {
      repository.findDetail.mockResolvedValue(detail);

      await expect(
        service.getPdf(2, { id: OTHER_MEMBER_ID, role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
