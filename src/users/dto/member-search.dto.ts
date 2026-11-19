import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import type { User } from '@PrismaClient';

export const MEMBER_SEARCH_LENGTH_MESSAGE = 'Escribe entre 2 y 100 caracteres para buscar.';

/** Query de GET /members (H04): código exacto o parte del nombre. */
export class MemberSearchQueryDto {
  @ApiProperty({ example: 'GYM-000001', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: MEMBER_SEARCH_LENGTH_MESSAGE })
  @Length(2, 100, { message: MEMBER_SEARCH_LENGTH_MESSAGE })
  q!: string;
}

/** Un miembro encontrado para vender o cobrar. */
export class MemberSearchItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GYM-000001' })
  memberCode!: string;

  @ApiProperty({ example: 'Juan Perez' })
  fullName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  static fromEntity(user: User): MemberSearchItemDto {
    return {
      id: user.id,
      memberCode: user.memberCode ?? '',
      fullName: user.fullName,
      email: user.email,
    };
  }
}

export class MemberSearchResponseDto {
  @ApiProperty({ type: [MemberSearchItemDto] })
  data!: MemberSearchItemDto[];
}
