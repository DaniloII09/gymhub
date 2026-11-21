export class CapacityBelowConfirmedReservationsError extends Error {
  constructor(public readonly confirmedReservations: number) {
    super(
      `El cupo no puede ser menor a las ${confirmedReservations} reservas confirmadas.`,
    );
    this.name = 'CapacityBelowConfirmedReservationsError';
  }
}

