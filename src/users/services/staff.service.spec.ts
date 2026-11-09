import { ConflictException } from '@nestjs/common';
import { StaffService } from '@Users/services';
import { EmailAlreadyTakenError } from '@Users/errors';
import type { UserRepository } from '@Users/repositories';
import type { UsersService } from '@Users/services';
import type { CreateStaffDto } from '@Users/dto';

const dto: CreateStaffDto = { fullName: 'Ana Gómez', email: 'ana@example.com', role: 'RECEPTION' };

function build() {
  const userRepository = { createStaff: vi.fn(), listStaff: vi.fn() };
  const usersService = { hashPassword: vi.fn().mockResolvedValue('hash') };
  const service = new StaffService(
    userRepository as unknown as UserRepository,
    usersService as unknown as UsersService,
  );
  return { service, userRepository };
}

describe('StaffService', () => {
  it('crea personal con rol y contraseña temporal', async () => {
    const { service, userRepository } = build();
    userRepository.createStaff.mockImplementation(async (data) => ({ id: 's1', fullName: data.fullName, role: data.role }));
    const { user, temporaryPassword } = await service.create(dto, 'admin-id');
    expect(temporaryPassword).toHaveLength(10);
    expect(user.role).toBe('RECEPTION');
    expect(userRepository.createStaff).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'RECEPTION', createdById: 'admin-id' }),
    );
  });

  it('traduce correo repetido a 409', async () => {
    const { service, userRepository } = build();
    userRepository.createStaff.mockRejectedValue(new EmailAlreadyTakenError(dto.email));
    await expect(service.create(dto, 'admin-id')).rejects.toBeInstanceOf(ConflictException);
  });

  it('lista en forma paginada', async () => {
    const { service, userRepository } = build();
    userRepository.listStaff.mockResolvedValue({
      items: [{ id: 's1', fullName: 'Ana', email: 'a@e.com', role: 'RECEPTION', isActive: true }],
      total: 1,
    });
    const result = await service.list({ page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].email).toBe('a@e.com');
  });
});