import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsString, MaxDate, MaxLength, MinLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

export class CreateMemberDto {
  @ApiProperty({ example: 'Juan Pérez', minLength: 3, maxLength: 100 })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  fullName!: string;

  @ApiProperty({ enum: ['M', 'F'] })
  @IsIn(['M', 'F'], { message: 'El sexo debe ser M o F.' })
  sex!: 'M' | 'F';

  @ApiProperty({ type: String, format: 'date', example: '1998-04-12' })
  @Type(() => Date)
  @IsDate({ message: 'La fecha de nacimiento no es válida.' })
  // La ValidationPipe global transforma antes de validar, así que acá ya es Date.
  @MaxDate(() => new Date(), {
    message: 'La fecha de nacimiento no puede ser futura.',
  })
  birthDate!: Date;

  @ApiProperty({ example: 'juanperez@example.com', format: 'email', maxLength: 120 })
  @IsNormalizedEmail()
  @MaxLength(120, { message: 'El correo no puede superar los 120 caracteres.' })
  email!: string;
}