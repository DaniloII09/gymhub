import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListPlansQueryDto {
  @ApiPropertyOptional({
    description: 'true: solo los planes activos (los que se pueden vender). Sin el filtro: todos.',
    example: true,
  })
  @IsOptional()
  // Los query params llegan como texto: "true"/"false" pasan a boolean y
  // cualquier otro valor queda igual para que IsBoolean responda 400.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'active debe ser true o false.' })
  active?: boolean;
}
