import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';
import type { PlanType } from '@PrismaClient';

// Reglas de un plan (H03), compartidas por el alta y la edición.

export const PLAN_NAME_MIN = 3;
export const PLAN_NAME_MAX = 40;
export const PLAN_DURATION_MIN = 1;
export const PLAN_DURATION_MAX = 365;
export const PLAN_BENEFITS_MAX = 300;
/** Decimal(8, 2): el mayor precio que cabe en la columna. */
export const PLAN_PRICE_MAX = 999_999.99;

export const PLAN_NAME_MESSAGE = `El nombre debe tener de ${PLAN_NAME_MIN} a ${PLAN_NAME_MAX} caracteres.`;
export const PLAN_DURATION_MESSAGE = `La duración debe ser un número entero de ${PLAN_DURATION_MIN} a ${PLAN_DURATION_MAX} días.`;
export const DROP_IN_DURATION_MESSAGE = 'La clase suelta no lleva duración.';
export const PLAN_PRICE_MESSAGE = 'El precio debe ser mayor a $0.00, con 2 decimales como máximo.';
export const PLAN_BENEFITS_MESSAGE = `Los beneficios no pueden superar los ${PLAN_BENEFITS_MAX} caracteres.`;

export function isValidDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= PLAN_DURATION_MIN &&
    value <= PLAN_DURATION_MAX
  );
}

/** Recorta los strings antes de validar; deja pasar cualquier otro valor. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Valida la duración según el tipo del plan, con un solo mensaje:
 * MONTHLY y QUARTERLY la exigen de 1 a 365 días; DROP_IN no la acepta.
 * Con @ValidateIf no se podría, porque desactiva todas las reglas del campo.
 */
export function IsDurationForType(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDurationForType',
      validator: {
        validate: (value: unknown, args) => {
          const type = (args?.object as { type?: PlanType } | undefined)?.type;
          if (type === 'DROP_IN') return value === undefined || value === null;
          return isValidDuration(value);
        },
        defaultMessage: (args) =>
          (args?.object as { type?: PlanType } | undefined)?.type === 'DROP_IN'
            ? DROP_IN_DURATION_MESSAGE
            : PLAN_DURATION_MESSAGE,
      },
    },
    options,
  );
}
