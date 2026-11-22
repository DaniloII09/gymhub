import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PasswordChangeGuard } from '@Auth/guards';
import { CheckInsService } from '@CheckIns/services';
import type { CheckInRepository } from '@CheckIns/repositories';
import type { MembershipStatusService } from '@Common/contracts';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import { MembersController } from '@Users/controllers';
import { CreateMemberDto } from '@Users/dto';
import { EmailAlreadyTakenError } from '@Users/errors';
import { UserRepository } from '@Users/repositories';
import { MembersService } from './members.service.js';
import { rolesAllowed } from '../../../test/helpers/roles-access.js';

const dto = {
  fullName: 'Carla Prueba QA',
  sex: 'F',
  birthDate: '2000-05-10',
  email: 'carla.qa@gymhub.test',
};

function membersService() {
  const prisma = {
    user: { create: vi.fn(async ({ data }) => ({ id: 'u-1', ...data })) },
  };
  const repository = new UserRepository(prisma as never);
  vi.spyOn(repository, 'nextMemberCode').mockResolvedValue('GYM-000004');
  const config = { get: vi.fn().mockReturnValue(4) };
  const service = new MembersService(
    repository,
    config as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, repository, prisma };
}

describe('H01. Inscribir a un nuevo miembro', () => {
  it('AC1: crea la cuenta con rol Miembro, fecha de inscripción de hoy, código y contraseña temporal de 10 caracteres', async () => {
    const { service, prisma } = membersService();

    const { user, temporaryPassword } = await service.enroll(
      plainToInstance(CreateMemberDto, dto),
      'recepcion-1',
    );

    const saved = prisma.user.create.mock.calls[0][0].data;
    expect(saved.role).toBe('MEMBER');
    expect(saved.mustChangePassword).toBe(true);
    expect((saved.enrolledAt as Date).toDateString()).toBe(
      new Date().toDateString(),
    );
    expect(user.memberCode).toBe('GYM-000004');
    expect(temporaryPassword).toHaveLength(10);
  });

  it('AC2: con la contraseña temporal pendiente bloquea cualquier otra pantalla hasta cambiarla', () => {
    const guard = new PasswordChangeGuard(new Reflector());
    const context = (mustChangePassword: boolean) =>
      ({
        getHandler: () => MembersController.prototype.search,
        getClass: () => MembersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { mustChangePassword } }),
        }),
      }) as unknown as ExecutionContext;

    expect(() => guard.canActivate(context(true))).toThrow(
      /cambiar tu contraseña temporal/,
    );
    expect(guard.canActivate(context(false))).toBe(true);
  });

  it('AC3: el perfil muestra como próxima fecha de pago el vencimiento, o ninguna si no tiene membresía', async () => {
    const members = [
      { id: 'm-1', memberCode: 'GYM-000001', fullName: 'Juan Perez' },
      { id: 'm-2', memberCode: 'GYM-000004', fullName: 'Carla Prueba QA' },
    ];
    const userRepository = {
      searchMembers: vi.fn().mockResolvedValue(members),
    };
    const status: MembershipStatusService = {
      currentFor: vi.fn(async (id: string) =>
        id === 'm-1'
          ? {
              status: 'ACTIVE',
              planName: 'Mensual',
              planType: 'MONTHLY',
              endDate: new Date('2026-12-08T12:00:00Z'),
              daysLeft: 17,
            }
          : {
              status: 'NONE',
              planName: null,
              planType: null,
              endDate: null,
              daysLeft: null,
            },
      ),
    } as MembershipStatusService;
    const service = new CheckInsService(
      {} as CheckInRepository,
      userRepository as unknown as UserRepository,
      status,
    );

    const [juan, carla] = await service.lookup('GYM');

    expect(juan.nextPaymentDate).toBe('2026-12-08');
    expect(carla.membershipStatus).toBe('NONE');
    expect(carla.nextPaymentDate).toBeNull();
  });

  it('AC4: con un correo ya registrado no crea la cuenta y responde "Ese correo ya está registrado."', async () => {
    const { service, repository } = membersService();
    vi.spyOn(repository, 'createMember').mockRejectedValue(
      new EmailAlreadyTakenError(dto.email),
    );

    const attempt = service.enroll(
      plainToInstance(CreateMemberDto, dto),
      'recepcion-1',
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow('Ese correo ya está registrado.');
  });

  it('AC5: rechaza una fecha de nacimiento futura con "La fecha de nacimiento no puede ser futura."', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const errors = await validate(
      plainToInstance(CreateMemberDto, { ...dto, birthDate: tomorrow }),
    );

    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toContain(
      'La fecha de nacimiento no puede ser futura.',
    );
  });

  it('AC6: solo Recepción y Administrador pueden inscribir; Miembro y Entrenador reciben 403', () => {
    expect(rolesAllowed(MembersController, 'enroll')).toEqual([
      'ADMIN',
      'RECEPTION',
    ]);
  });
});
