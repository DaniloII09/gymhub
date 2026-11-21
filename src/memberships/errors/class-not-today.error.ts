/** Error de dominio: la clase suelta solo se vende para una clase de hoy. */
export class ClassNotTodayError extends Error {
  constructor(public readonly classId: number) {
    super(`La clase ${classId} no es de hoy.`);
    this.name = 'ClassNotTodayError';
  }
}
