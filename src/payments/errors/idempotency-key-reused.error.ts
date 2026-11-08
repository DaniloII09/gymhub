/**
 * Error de dominio: la clave de idempotencia ya se usó para pagar OTRO cobro.
 * Con el mismo cobro no es error: se devuelve el resultado original.
 */
export class IdempotencyKeyReusedError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`La clave ${idempotencyKey} ya se usó con otro cobro.`);
    this.name = 'IdempotencyKeyReusedError';
  }
}
