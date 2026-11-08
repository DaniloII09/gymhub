import { MachineAvailabilityDto } from '@Machines/dto';

describe('MachineAvailabilityDto', () => {
  it('solo expone nombre, área y estado', () => {
    // Simula una fila con más columnas de las que la consulta debería traer.
    const row = {
      id: 7,
      code: 'CAR-001',
      name: 'Caminadora 1',
      area: 'CARDIO',
      status: 'UNDER_MAINTENANCE',
      reason: 'Cambio de banda',
      changedBy: 'admin@gymhub.test',
    } as unknown as Parameters<typeof MachineAvailabilityDto.fromEntity>[0];

    expect(MachineAvailabilityDto.fromEntity(row)).toEqual({
      name: 'Caminadora 1',
      area: 'CARDIO',
      status: 'UNDER_MAINTENANCE',
    });
  });
});
