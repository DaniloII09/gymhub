import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from '@Users/services';
import type { UserRepository } from '@Users/repositories';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';

function build() {
  const userRepository = { findById: vi.fn(), setActive: vi.fn(), deactivate: vi.fn() };
  const config = { get: vi.fn().mockReturnValue(12) };
  const service = new UsersService(
    userRepository as unknown as UserRepository,
    config as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, userRepository };
}

describe('UsersService.setActive', () => {
  it('403 al desactivar la propia cuenta', async () => {
    const { service } = build();
    await expect(service.setActive('me', false, 'me')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 si el usuario no existe', async () => {
    const { service, userRepository } = build();
    userRepository.findById.mockResolvedValue(null);
    await expect(service.setActive('x', false, 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva (con revocación) a otro usuario', async () => {
    const { service, userRepository } = build();
    userRepository.findById.mockResolvedValue({ id: 'x' });
    userRepository.deactivate.mockResolvedValue({ id: 'x', isActive: false });
    const user = await service.setActive('x', false, 'admin');
    expect(user.isActive).toBe(false);
    expect(userRepository.deactivate).toHaveBeenCalledWith('x');
  });
});