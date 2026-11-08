import { ConflictException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { MembersService } from '@Users/services';
import { EmailAlreadyTakenError } from '@Users/errors';
import type { UserRepository } from '@Users/repositories';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import type { CreateMemberDto } from '@Users/dto';

const baseDto: CreateMemberDto = {
  fullName: 'Juan Pérez',
  sex: 'M',
  birthDate: new Date('1998-04-12'),
  email: 'juanperez@example.com',
};

function build() {
  const userRepository = {
    nextMemberCode: vi.fn().mockResolvedValue('GYM-000004'),
    createMember: vi.fn(),
  };
  const configService = { get: vi.fn().mockReturnValue(4) }; // saltRounds bajo = test rápido
  const service = new MembersService(
    userRepository as unknown as UserRepository,
    configService as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, userRepository };
}

describe('MembersService', () => {
  it('inscribe con código de la secuencia y password temporal de 10 chars', async () => {
    const { service, userRepository } = build();
    userRepository.createMember.mockImplementation(async (data) => ({
      id: 'uuid-1',
      memberCode: data.memberCode,
      fullName: data.fullName,
      enrolledAt: new Date(),
    }));

    const { user, temporaryPassword } = await service.enroll(baseDto, 'recep-id');

    expect(temporaryPassword).toHaveLength(10);
    expect(userRepository.nextMemberCode).toHaveBeenCalledOnce();
    expect(user.memberCode).toBe('GYM-000004');
  });

  it('la contraseña temporal trae minúscula, mayúscula y dígito', async () => {
    const { service, userRepository } = build();
    userRepository.createMember.mockResolvedValue({
      id: 'x', memberCode: 'GYM-000004', fullName: 'x', enrolledAt: new Date(),
    });
    const { temporaryPassword } = await service.enroll(baseDto, 'recep-id');
    expect(temporaryPassword).toMatch(/[a-z]/);
    expect(temporaryPassword).toMatch(/[A-Z]/);
    expect(temporaryPassword).toMatch(/\d/);
  });

  it('guarda un hash bcrypt, nunca el password en claro', async () => {
    const { service, userRepository } = build();
    let storedHash = '';
    userRepository.createMember.mockImplementation(async (data) => {
      storedHash = data.passwordHash;
      return { id: 'x', memberCode: data.memberCode, fullName: data.fullName, enrolledAt: new Date() };
    });
    const { temporaryPassword } = await service.enroll(baseDto, 'recep-id');
    expect(storedHash).toMatch(/^\$2[aby]\$/);
    expect(storedHash).not.toContain(temporaryPassword);
    await expect(bcrypt.compare(temporaryPassword, storedHash)).resolves.toBe(true);
  });

  it('traduce el correo repetido a 409', async () => {
    const { service, userRepository } = build();
    userRepository.createMember.mockRejectedValue(new EmailAlreadyTakenError(baseDto.email));
    await expect(service.enroll(baseDto, 'recep-id')).rejects.toBeInstanceOf(ConflictException);
  });
});