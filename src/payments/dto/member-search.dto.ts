import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import type { MemberOption } from '@Payments/repositories';

/** Query de GET /charges/member-search. */
export class MemberSearchQueryDto {
  @ApiProperty({ example: 'miembro', minLength: 2, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100, { message: 'Escribe entre 2 y 100 caracteres para buscar.' })
  q!: string;
}

/** Un miembro que se puede elegir en la pantalla de cobro. */
export class MemberOptionDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({
    example: 'miembro@gymhub.test',
    description: 'Se cambia por nombre y código cuando H01 los agregue',
  })
  email!: string;

  static fromEntity(member: MemberOption): MemberOptionDto {
    return { memberId: member.id, email: member.email };
  }
}

/** Respuesta de GET /charges/member-search (máximo 10). */
export class MemberOptionListDto {
  @ApiProperty({ type: [MemberOptionDto] })
  data!: MemberOptionDto[];
}
