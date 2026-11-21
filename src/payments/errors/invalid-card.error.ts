/**
 * Error de dominio: los datos de la tarjeta no tienen el formato esperado.
 * El mensaje nunca incluye el número ni el CVV.
 */
export class InvalidCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCardError';
  }
}
