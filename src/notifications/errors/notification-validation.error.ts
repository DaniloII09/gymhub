/**
 * Error de dominio del servicio central de avisos (BE-24.1): el aviso no se
 * registró porque falta un campo, la lista de destinatarios está vacía o es muy
 * larga, el módulo de origen no existe o algún destinatario no existe o está
 * inactivo.
 *
 * Es un error de dominio y no un 400 porque quien llama es otro servicio, no un
 * cliente HTTP: cada módulo decide cómo responder si su aviso no se registra.
 */
export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationValidationError';
  }
}
