import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@PrismaClient';

export class MemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GYM-000004' })
  memberCode!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  fullName!: string;

  @ApiProperty({ type: String, format: 'date' })
  enrolledAt!: Date;

  @ApiProperty({
    description: 'Contraseña temporal para entregar al miembro. Se muestra una sola vez.',
  })
  temporaryPassword!: string;

  /** El password temporal viene en claro desde el servicio, no de la entidad. */
  static from(user: User, temporaryPassword: string): MemberResponseDto {
    return {
      id: user.id,
      memberCode: user.memberCode as string,
      fullName: user.fullName,
      enrolledAt: user.enrolledAt as Date,
      temporaryPassword,
    };
  }
}