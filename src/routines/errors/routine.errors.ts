export class RoutineNotFoundError extends Error {
  constructor() {
    super('No encontramos esa rutina.');
    this.name = 'RoutineNotFoundError';
  }
}

export class RoutineForbiddenError extends Error {
  constructor() {
    super('No puedes modificar una rutina de otro entrenador.');
    this.name = 'RoutineForbiddenError';
  }
}

export class RoutineMemberNotFoundError extends Error {
  constructor() {
    super('No encontramos ese miembro.');
    this.name = 'RoutineMemberNotFoundError';
  }
}
