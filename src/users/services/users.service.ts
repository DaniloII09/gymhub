import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { UserRepository } from '@Users/repositories';
import type { EnvConfig } from '@Config';
import type { User } from '@PrismaClient';

@Injectable()
export class UsersService {
  private readonly saltRounds: number;

  constructor(
    private readonly userRepository: UserRepository,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.saltRounds = configService.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  /** Delega el cambio atómico de contraseña al repositorio (BE-1.2). */
  changePassword(userId: string, newPasswordHash: string): Promise<void> {
    return this.userRepository.changePassword(userId, newPasswordHash);
  }

    /**
   * Activa o desactiva una cuenta (BE-2.2). No se puede desactivar la propia.
   * Al desactivar se revocan las sesiones (lo hace el repositorio en una tx).
   */
  async setActive(targetUserId: string, isActive: boolean, actingUserId: string): Promise<User> {
    if (!isActive && targetUserId === actingUserId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta.');
    }
    const user = await this.userRepository.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('El usuario no existe.');
    }
    return isActive
      ? this.userRepository.setActive(targetUserId, true)
      : this.userRepository.deactivate(targetUserId);
  }
}