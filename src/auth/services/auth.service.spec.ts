import { BadRequestException } from '@nestjs/common';
import { AuthService } from '@Auth/services';
import type { UsersService } from '@Users/services';
import type { TokenService } from '@Auth/services';
import type { ChangePasswordDto } from '@Auth/dto';
import type { User } from '@PrismaClient';

const user = { id: 'u1', passwordHash: 'hash-actual' } as User;
const dto: ChangePasswordDto = { currentPassword: 'Actual123', newPassword: 'Nueva123' };

function build(overrides: Partial<Record<string, unknown>> = {}) {
  const usersService = {
    verifyPassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue('hash-nuevo'),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const service = new AuthService(
    usersService as unknown as UsersService,
    {} as unknown as TokenService,
  );
  return { service, usersService };
}

describe('AuthService.changePassword', () => {
  it('cambia la contraseña con datos válidos', async () => {
    const { service, usersService } = build();
    await expect(service.changePassword(user, dto)).resolves.toBeUndefined();
    expect(usersService.hashPassword).toHaveBeenCalledWith('Nueva123');
    expect(usersService.changePassword).toHaveBeenCalledWith('u1', 'hash-nuevo');
  });

  it('400 si la contraseña actual no coincide', async () => {
    const { service } = build({ verifyPassword: vi.fn().mockResolvedValue(false) });
    await expect(service.changePassword(user, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si la nueva es igual a la actual', async () => {
    const { service } = build();
    const same = { currentPassword: 'Igual123', newPassword: 'Igual123' };
    await expect(service.changePassword(user, same)).rejects.toBeInstanceOf(BadRequestException);
  });
});