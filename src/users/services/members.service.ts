import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { UserRepository } from '@Users/repositories';
import { EmailAlreadyTakenError } from '@Users/errors';
import { generateTemporaryPassword } from './generate-temporary-password.js';
import type { CreateMemberDto } from '@Users/dto';
import type { EnvConfig } from '@Config';
import type { User } from '@PrismaClient';

@Injectable()
export class MembersService {
  private readonly saltRounds: number;

  constructor(
    private readonly userRepository: UserRepository,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.saltRounds = configService.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  /**
   * Inscribe un miembro: genera código y contraseña temporal, crea la cuenta
   * con rol MEMBER marcada para cambio obligatorio. El código sale de la
   * secuencia, así que dos inscripciones simultáneas reciben códigos distintos.
   */
  async enroll(
    dto: CreateMemberDto,
    createdById: string,
  ): Promise<{ user: User; temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, this.saltRounds);
    const memberCode = await this.userRepository.nextMemberCode();

    try {
      const user = await this.userRepository.createMember({
        fullName: dto.fullName,
        sex: dto.sex,
        birthDate: dto.birthDate,
        email: dto.email,
        passwordHash,
        memberCode,
        createdById,
      });
      return { user, temporaryPassword };
    } catch (error) {
      if (error instanceof EmailAlreadyTakenError) {
        throw new ConflictException('Ese correo ya está registrado.');
      }
      throw error;
    }
  }
}