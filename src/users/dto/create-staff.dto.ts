import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

const STAFF_ROLES = ['TRAINER', 'RECEPTION', 'ADMIN'] as const;

export class CreateStaffDto {
  @ApiProperty({ minLength: 3, maxLength: 100 })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  fullName!: string;

  @ApiProperty({ format: 'email', maxLength: 120 })
  @IsNormalizedEmail()
  @MaxLength(120, { message: 'El correo no puede superar los 120 caracteres.' })
  email!: string;

  // role MEMBER no está en la lista -> 400 (criterio de BE-2.2).
  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES, { message: 'El rol debe ser TRAINER, RECEPTION o ADMIN.' })
  role!: (typeof STAFF_ROLES)[number];
}