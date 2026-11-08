/** Error de dominio: los datos para crear un cobro no son válidos (monto o concepto). */
export class InvalidChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChargeError';
  }
}
