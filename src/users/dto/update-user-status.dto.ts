import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty()
  @IsBoolean({ message: 'isActive debe ser booleano.' })
  isActive!: boolean;
}