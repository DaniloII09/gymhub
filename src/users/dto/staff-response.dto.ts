import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@PrismaClient';

export class StaffCreatedResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ enum: ['TRAINER', 'RECEPTION', 'ADMIN'] })
  role!: User['role'];
  @ApiProperty({ description: 'Contraseña temporal; se muestra una sola vez.' })
  temporaryPassword!: string;

  static from(user: User, temporaryPassword: string): StaffCreatedResponseDto {
    return { id: user.id, fullName: user.fullName, role: user.role, temporaryPassword };
  }
}

export class StaffListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ format: 'email' })
  email!: string;
  @ApiProperty({ enum: ['TRAINER', 'RECEPTION', 'ADMIN'] })
  role!: User['role'];
  @ApiProperty()
  isActive!: boolean;

  static fromEntity(user: User): StaffListItemDto {
    return { id: user.id, fullName: user.fullName, email: user.email, role: user.role, isActive: user.isActive };
  }
}