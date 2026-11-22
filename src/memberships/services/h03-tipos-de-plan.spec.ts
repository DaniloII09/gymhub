import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlansController } from '@Memberships/controllers';
import { CreatePlanDto } from '@Memberships/dto';
import { PlanRepository } from '@Memberships/repositories';
import { PlansService } from './plans.service.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const monthly = {
  name: 'Mensual QA',
  type: 'MONTHLY',
  durationDays: 30,
  price: 30,
  benefits: 'Acceso libre',
};

function build() {
  const repository = {
    nameExists: vi.fn().mockResolvedValue(false),
    hasActiveDropIn: vi.fn().mockResolvedValue(false),
    create: vi.fn(async (data) => ({ id: 1, isActive: true, ...data })),
    findAll: vi.fn(),
  };
  return {
    repository,
    service: new PlansService(repository as unknown as PlanRepository),
  };
}

async function messages(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreatePlanDto, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('H03. Definir los tipos de plan', () => {
  it('AC1: con datos válidos el plan queda activo y disponible para la venta', async () => {
    const { service, repository } = build();
    expect(await messages(monthly)).toEqual([]);

    const plan = await service.create(plainToInstance(CreatePlanDto, monthly));

    expect(plan.isActive).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mensual QA',
        type: 'MONTHLY',
        durationDays: 30,
        price: 30,
      }),
    );
  });

  it('AC2: el plan Clase suelta se guarda sin duración', async () => {
    const { service, repository } = build();

    await service.create(
      plainToInstance(CreatePlanDto, {
        name: 'Clase suelta QA',
        type: 'DROP_IN',
        price: 5,
      }),
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DROP_IN', durationDays: null }),
    );
  });

  it('AC3: desactivar solo marca el plan como inactivo, la venta lista solo activos y las membresías no se tocan', async () => {
    const prisma = {
      plan: {
        update: vi.fn().mockResolvedValue({ id: 1, isActive: false }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      membership: { update: vi.fn(), updateMany: vi.fn() },
    };
    const repository = new PlanRepository(prisma as never);

    await new PlansService(repository).deactivate(1);
    await repository.findAll(true);

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    });
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(prisma.membership.update).not.toHaveBeenCalled();
    expect(prisma.membership.updateMany).not.toHaveBeenCalled();
  });

  it('AC4: rechaza precio de $0.00, duración fuera de 1 a 365 y nombre repetido, con el motivo', async () => {
    expect(await messages({ ...monthly, price: 0 })).toContain(
      'El precio debe ser mayor a $0.00, con 2 decimales como máximo.',
    );
    expect(await messages({ ...monthly, durationDays: 366 })).toContain(
      'La duración debe ser un número entero de 1 a 365 días.',
    );

    const { service, repository } = build();
    repository.nameExists.mockResolvedValue(true);
    await expect(
      service.create(plainToInstance(CreatePlanDto, monthly)),
    ).rejects.toThrow('Ya existe un plan con ese nombre.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('AC5: no permite un segundo plan Clase suelta activo: "Ya existe un plan de clase suelta activo."', async () => {
    const { service, repository } = build();
    repository.hasActiveDropIn.mockResolvedValue(true);

    const attempt = service.create(
      plainToInstance(CreatePlanDto, {
        name: 'Otra suelta',
        type: 'DROP_IN',
        price: 5,
      }),
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      'Ya existe un plan de clase suelta activo.',
    );
  });

  it('AC6: solo el Administrador puede crear, editar o desactivar planes', () => {
    expect(rolesAllowed(PlansController, 'create')).toEqual(['ADMIN']);
    expect(rolesAllowed(PlansController, 'update')).toEqual(['ADMIN']);
    expect(rolesAllowed(PlansController, 'deactivate')).toEqual(['ADMIN']);
  });
});
