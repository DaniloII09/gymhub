import { IsInt, IsNotEmpty, IsString, Max, Min, Matches } from 'class-validator';

export class CreateAvailabilityBlockDto {
  @IsInt()
  @Min(1, { message: 'weekday debe ser entre 1 (Lunes) y 7 (Domingo)' })
  @Max(7, { message: 'weekday debe ser entre 1 (Lunes) y 7 (Domingo)' })
  weekday: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime debe tener formato HH:mm (ej. 08:00)',
  })
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime debe tener formato HH:mm (ej. 11:30)',
  })
  endTime: string;
}