import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_DROP_IN_EXISTS_MESSAGE,
  PLAN_NAME_TAKEN_MESSAGE,
  PLAN_NOT_FOUND_MESSAGE,
  PlansService,
} from '@Memberships/services';
import {
  ActiveDropInPlanExistsError,
  PlanNameTakenError,
  PlanNotFoundError,
} from '@Memberships/errors';
import { DROP_IN_DURATION_MESSAGE, type CreatePlanDto } from '@Memberships/dto';
import type { PlanRepository } from '@Memberships/repositories';

const monthlyDto: CreatePlanDto = {
  name: 'Mensual Plus',
  type: 'MONTHLY',
  durationDays: 30,
  price: 25,
  benefits: 'Acceso ilimitado',
};

const storedPlan = (overrides: object = {}) => ({
  id: 7,
  name: 'Mensual Plus',
  type: 'MONTHLY',
  durationDays: 30,
  price: { toNumber: () => 25 },
  benefits: null,
  isActive: true,
  ...overrides,
});

function build() {
  const planRepository = {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(storedPlan()),
    nameExists: vi.fn().mockResolvedValue(false),
    hasActiveDropIn: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockImplementation(async (data) => ({ id: 1, isActive: true, ...data })),
    update: vi.fn().mockImplementation(async (id, data) => ({ ...storedPlan(), id, ...data })),
    deactivate: vi.fn().mockImplementation(async (id) => ({ ...storedPlan(), id, isActive: false })),
  };
  const service = new PlansService(planRepository as unknown as PlanRepository);
  return { service, planRepository };
}

describe('PlansService.list', () => {
  it('pasa el filtro de activos al repositorio', async () => {
    const { service, planRepository } = build();
    await service.list(true);
    expect(planRepository.findAll).toHaveBeenCalledWith(true);
  });
});

describe('PlansService.create (BE-3.1)', () => {
  it('crea un plan Mensual con sus datos', async () => {
    const { service, planRepository } = build();
    await service.create(monthlyDto);
    expect(planRepository.create).toHaveBeenCalledWith({
      name: 'Mensual Plus',
      type: 'MONTHLY',
      durationDays: 30,
      price: 25,
      benefits: 'Acceso ilimitado',
    });
  });

  it('guarda DROP_IN sin duración y beneficios vacíos como null', async () => {
    const { service, planRepository } = build();
    await service.create({ name: 'Suelta', type: 'DROP_IN', price: 5, benefits: '' });
    expect(planRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationDays: null, benefits: null }),
    );
  });

  it('responde 409 si el nombre ya existe, sin crear', async () => {
    const { service, planRepository } = build();
    planRepository.nameExists.mockResolvedValue(true);
    await expect(service.create(monthlyDto)).rejects.toThrow(
      new ConflictException(PLAN_NAME_TAKEN_MESSAGE),
    );
    expect(planRepository.create).not.toHaveBeenCalled();
  });

  it('responde 409 con el mensaje de la historia si ya hay un DROP_IN activo', async () => {
    const { service, planRepository } = build();
    planRepository.hasActiveDropIn.mockResolvedValue(true);
    await expect(service.create({ name: 'Otra', type: 'DROP_IN', price: 5 })).rejects.toThrow(
      new ConflictException(ACTIVE_DROP_IN_EXISTS_MESSAGE),
    );
    expect(planRepository.create).not.toHaveBeenCalled();
  });

  it('un DROP_IN activo no impide crear planes Mensuales', async () => {
    const { service, planRepository } = build();
    planRepository.hasActiveDropIn.mockResolvedValue(true);
    await service.create(monthlyDto);
    expect(planRepository.hasActiveDropIn).not.toHaveBeenCalled();
    expect(planRepository.create).toHaveBeenCalled();
  });

  it.each([
    [new PlanNameTakenError('Mensual'), PLAN_NAME_TAKEN_MESSAGE],
    [new ActiveDropInPlanExistsError(), ACTIVE_DROP_IN_EXISTS_MESSAGE],
  ])('traduce a 409 la carrera que detecta la base: %s', async (error, message) => {
    const { service, planRepository } = build();
    planRepository.create.mockRejectedValue(error);
    await expect(service.create(monthlyDto)).rejects.toThrow(new ConflictException(message));
  });
});

describe('PlansService.update (BE-3.1)', () => {
  it('responde 404 si el plan no existe', async () => {
    const { service, planRepository } = build();
    planRepository.findById.mockResolvedValue(null);
    await expect(service.update(99, { price: 30 })).rejects.toThrow(
      new NotFoundException(PLAN_NOT_FOUND_MESSAGE),
    );
  });

  it('rechaza con 400 una duración en un plan DROP_IN', async () => {
    const { service, planRepository } = build();
    planRepository.findById.mockResolvedValue(storedPlan({ type: 'DROP_IN', durationDays: null }));
    await expect(service.update(7, { durationDays: 1 })).rejects.toThrow(
      new BadRequestException(DROP_IN_DURATION_MESSAGE),
    );
    expect(planRepository.update).not.toHaveBeenCalled();
  });

  it('compara el nombre excluyendo el propio plan', async () => {
    const { service, planRepository } = build();
    await service.update(7, { name: 'MENSUAL PLUS' });
    expect(planRepository.nameExists).toHaveBeenCalledWith('MENSUAL PLUS', 7);
  });

  it('responde 409 si el nombre nuevo es de otro plan', async () => {
    const { service, planRepository } = build();
    planRepository.nameExists.mockResolvedValue(true);
    await expect(service.update(7, { name: 'Trimestral' })).rejects.toThrow(
      new ConflictException(PLAN_NAME_TAKEN_MESSAGE),
    );
  });

  it('solo envía los campos que cambian y vacía beneficios con null', async () => {
    const { service, planRepository } = build();
    await service.update(7, { price: 30, benefits: '' });
    expect(planRepository.update).toHaveBeenCalledWith(7, {
      name: undefined,
      durationDays: undefined,
      price: 30,
      benefits: null,
    });
  });

  it('sin beneficios en el cuerpo no los toca', async () => {
    const { service, planRepository } = build();
    await service.update(7, { price: 30 });
    expect(planRepository.update.mock.calls[0][1]).not.toHaveProperty('benefits');
  });
});

describe('PlansService.deactivate (BE-3.1)', () => {
  it('desactiva el plan', async () => {
    const { service } = build();
    await expect(service.deactivate(7)).resolves.toMatchObject({ id: 7, isActive: false });
  });

  it('responde 404 si el plan no existe', async () => {
    const { service, planRepository } = build();
    planRepository.deactivate.mockRejectedValue(new PlanNotFoundError(99));
    await expect(service.deactivate(99)).rejects.toThrow(
      new NotFoundException(PLAN_NOT_FOUND_MESSAGE),
    );
  });
});
