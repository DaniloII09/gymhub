import { ConflictException } from '@nestjs/common';
import { CheckInsController } from '@CheckIns/controllers';
import {
  checkInFixture,
  MEMBER_ID,
} from '../../../test/helpers/check-in-fixture.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

describe('H13. Registrar el ingreso de un miembro', () => {
  it('AC1: busca por código o por nombre y guarda el ingreso con la fecha y hora del servidor', async () => {
    const juan = {
      id: MEMBER_ID,
      memberCode: 'GYM-000001',
      fullName: 'Juan Perez',
    };
    const { service, tx, userRepository } = checkInFixture({ members: [juan] });
    const serverNow = new Date('2026-11-21T15:42:00Z');

    const [byCode] = await service.lookup('GYM-000001');
    const [byName] = await service.lookup('juan');
    const result = await service.register(
      byCode.memberId,
      'recepcion-1',
      serverNow,
    );

    expect(userRepository.searchMembers).toHaveBeenCalledWith('GYM-000001', 10);
    expect(byName.memberId).toBe(MEMBER_ID);
    expect(result.checkedInAt).toEqual(serverNow);
    expect(tx.checkIn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: MEMBER_ID,
        checkedInAt: serverNow,
      }),
    });
  });

  it('AC2: un dato que no es de ningún miembro no devuelve resultados para registrar', async () => {
    const { service } = checkInFixture({ members: [] });

    await expect(service.lookup('ZZZ-999')).resolves.toEqual([]);
  });

  it('AC3: no registra otra vez a quien ingresó hace menos de 30 minutos', async () => {
    const { service, tx } = checkInFixture({ recentCheckIns: 1 });

    const attempt = service.register(MEMBER_ID, 'recepcion-1', new Date());

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'Este miembro ya registró su ingreso hace menos de 30 minutos.',
    );
    expect(tx.checkIn.create).not.toHaveBeenCalled();
  });

  it('AC4: Miembro y Entrenador no pueden usar el check-in', () => {
    expect(rolesAllowed(CheckInsController, 'lookup')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
    expect(rolesAllowed(CheckInsController, 'register')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
  });
});
