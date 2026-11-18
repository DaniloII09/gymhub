import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateSessionPricingDto {
  @ApiProperty({
    description: 'Tarifa de la sesión personal de 60 minutos en USD (> 0)',
    example: 15,
    minimum: 0.01,
    maximum: 999999.99,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número positivo de hasta 2 decimales.' },
  )
  @Min(0.01, { message: 'El precio debe ser mayor que 0.' })
  @Max(999999.99, { message: 'El precio supera el límite permitido.' })
  price!: number;
}

export class SessionPricingResponseDto {
  @ApiProperty({ example: true })
  configured!: boolean;

  @ApiPropertyOptional({ example: 15, nullable: true })
  price!: number | null;
}
