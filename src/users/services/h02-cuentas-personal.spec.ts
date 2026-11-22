import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, type TokenService } from '@Auth/services';
import { StaffController, UsersController } from '@Users/controllers';
import { EmailAlreadyTakenError } from '@Users/errors';
import type { UserRepository } from '@Users/repositories';
import type { User } from '@PrismaClient';
import { StaffService } from './staff.service.js';
import { UsersService } from './users.service.js';
import {
  roleCanCall,
  rolesAllowed,
} from '../../../test/helpers/roles-access.js';

function build() {
  const userRepository = {
    createStaff: vi.fn(async (data) => ({
      id: 's-1',
      ...data,
      mustChangePassword: true,
    })),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    setActive: vi.fn(),
    deactivate: vi.fn(),
  };
  const config = { get: vi.fn().mockReturnValue(4) };
  const usersService = new UsersService(
    userRepository as unknown as UserRepository,
    config as never,
  );
  const staffService = new StaffService(
    userRepository as unknown as UserRepository,
    usersService,
  );
  return { userRepository, usersService, staffService };
}

describe('H02. Crear cuentas del personal y controlar el acceso por rol', () => {
  it('AC1: crea la cuenta con su rol y contraseña temporal, y el rol solo abre las opciones que le tocan', async () => {
    const { staffService, userRepository } = build();

    const { user, temporaryPassword } = await staffService.create(
      {
        fullName: 'Tomás Entrenador QA',
        email: 'tomas.qa@gymhub.test',
        role: 'TRAINER',
      },
      'admin-1',
    );

    expect(userRepository.createStaff).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'TRAINER' }),
    );
    expect(user.role).toBe('TRAINER');
    expect(temporaryPassword).toHaveLength(10);
    expect(roleCanCall(StaffController, 'list', 'TRAINER')).toBe(false);
    expect(roleCanCall(StaffController, 'list', 'ADMIN')).toBe(true);
  });

  it('AC2: un usuario que abre una acción de otro rol recibe 403 del servidor', () => {
    expect(roleCanCall(StaffController, 'create', 'RECEPTION')).toBe(false);
    expect(roleCanCall(StaffController, 'create', 'MEMBER')).toBe(false);
  });

  it('AC3: una cuenta desactivada ya no puede iniciar sesión y su historial no se borra', async () => {
    const { usersService, userRepository } = build();
    userRepository.findById.mockResolvedValue({ id: 's-1' });
    userRepository.deactivate.mockResolvedValue({ id: 's-1', isActive: false });

    await usersService.setActive('s-1', false, 'admin-1');
    expect(userRepository.deactivate).toHaveBeenCalledWith('s-1');

    const inactive = {
      id: 's-1',
      email: 'tomas.qa@gymhub.test',
      passwordHash: 'h',
      isActive: false,
    } as User;
    const auth = new AuthService(
      {
        findByEmail: vi.fn().mockResolvedValue(inactive),
        verifyPassword: vi.fn().mockResolvedValue(true),
      } as unknown as UsersService,
      {} as TokenService,
    );
    await expect(
      auth.validateCredentials(inactive.email, 'Correcta123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('AC4: con un correo ya registrado no crea la cuenta y responde "Ese correo ya está registrado."', async () => {
    const { staffService, userRepository } = build();
    userRepository.createStaff.mockRejectedValue(
      new EmailAlreadyTakenError('admin@gymhub.test'),
    );

    const attempt = staffService.create(
      { fullName: 'Repetido', email: 'admin@gymhub.test', role: 'RECEPTION' },
      'admin-1',
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow('Ese correo ya está registrado.');
  });

  it('AC5: no permite desactivar la propia cuenta: "No puedes desactivar tu propia cuenta."', async () => {
    const { usersService, userRepository } = build();

    const attempt = usersService.setActive('admin-1', false, 'admin-1');

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'No puedes desactivar tu propia cuenta.',
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('AC6: solo el Administrador puede crear cuentas o cambiar su estado', () => {
    expect(rolesAllowed(StaffController, 'create')).toEqual(['ADMIN']);
    expect(rolesAllowed(UsersController, 'setStatus')).toEqual(['ADMIN']);
  });
});
