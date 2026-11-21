import { ConflictException, Injectable } from '@nestjs/common';
import { UserRepository } from '@Users/repositories';
import { EmailAlreadyTakenError } from '@Users/errors';
import { generateTemporaryPassword } from './generate-temporary-password.js';
import { UsersService } from './users.service.js';
import { paginate, toSkipTake, type Paginated } from '@Common/pagination';
import { StaffListItemDto } from '@Users/dto';
import type { CreateStaffDto } from '@Users/dto';
import type { User } from '@PrismaClient';

@Injectable()
export class StaffService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly usersService: UsersService,
  ) {}

  async create(
    dto: CreateStaffDto,
    createdById: string,
  ): Promise<{ user: User; temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.usersService.hashPassword(temporaryPassword);
    try {
      const user = await this.userRepository.createStaff({
        fullName: dto.fullName,
        email: dto.email,
        role: dto.role,
        passwordHash,
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

  async list(query: { page: number; pageSize: number }): Promise<Paginated<StaffListItemDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.userRepository.listStaff(skip, take);
    return paginate(items.map(StaffListItemDto.fromEntity), total, query);
  }
}