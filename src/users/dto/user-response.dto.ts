import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@PrismaClient';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: ['MEMBER', 'TRAINER', 'RECEPTION', 'ADMIN'] })
  role!: User['role'];

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}