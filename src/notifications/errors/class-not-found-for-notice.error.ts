/**
 * Error de dominio de H27: se pidió avisar la cancelación de una clase que no
 * existe. Es un error de programación de quien llama, no de un cliente HTTP.
 */
export class ClassNotFoundForNoticeError extends Error {
  constructor(classId: number) {
    super(`No existe la clase ${classId} para avisar su cancelación.`);
    this.name = 'ClassNotFoundForNoticeError';
  }
}
