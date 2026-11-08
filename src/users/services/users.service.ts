import { Injectable } from '@nestjs/common';
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
}