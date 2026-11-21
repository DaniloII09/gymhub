import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H21 contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido
 * (usuarios demo y las 8 máquinas). Usa la máquina FUN-001, distinta de la de
 * H20, y la deja como la encontró al terminar.
 */
const PASSWORD = 'Demo1234!';
const MACHINE_CODE = 'FUN-001';
const MACHINE_NAME = 'Rack de sentadillas';

interface AvailabilityItem {
  name: string;
  area: string;
  status: string;
}

describe('Máquinas · H21 disponibilidad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let memberToken: string;
  let machineId: number;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const availability = (token: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/machines/availability${query}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Igual que main.ts.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const machine = await prisma.machine.findUniqueOrThrow({
      where: { code: MACHINE_CODE },
    });
    machineId = machine.id;
    await resetMachine();

    adminToken = await login('admin@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
  });

  afterAll(async () => {
    await resetMachine();
    await app.close();
  });

  async function resetMachine(): Promise<void> {
    await prisma.machineStatusChange.deleteMany({ where: { machineId } });
    await prisma.machine.update({
      where: { id: machineId },
      data: { status: 'OPERATIONAL' },
    });
  }

  it('un miembro ve nombre, área y estado, ordenados por área y nombre', async () => {
    const res = await availability(memberToken).expect(200);
    const data = res.body.data as AvailabilityItem[];

    expect(data.length).toBeGreaterThanOrEqual(8);
    for (const item of data) {
      expect(Object.keys(item).sort()).toEqual(['area', 'name', 'status']);
    }
    // Postgres ordena un enum por el orden en que se declararon sus valores.
    const areaOrder = ['CARDIO', 'STRENGTH', 'FREE_WEIGHTS', 'FUNCTIONAL'];
    const expected = [...data].sort(
      (a, b) =>
        areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area) ||
        a.name.localeCompare(b.name),
    );
    expect(data).toEqual(expected);
  });

  it('filtra por área y por estado', async () => {
    const byArea = await availability(memberToken, '?area=FUNCTIONAL').expect(
      200,
    );
    expect(
      (byArea.body.data as AvailabilityItem[]).every(
        (m) => m.area === 'FUNCTIONAL',
      ),
    ).toBe(true);

    const byStatus = await availability(
      memberToken,
      '?status=OUT_OF_SERVICE',
    ).expect(200);
    expect(
      (byStatus.body.data as AvailabilityItem[]).every(
        (m) => m.status === 'OUT_OF_SERVICE',
      ),
    ).toBe(true);
  });

  it('muestra el estado nuevo después de un cambio, sin motivo ni autor', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/machines/${machineId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_OF_SERVICE', reason: 'Cable de la polea roto' })
      .expect(200);

    const res = await availability(
      memberToken,
      '?area=FUNCTIONAL&status=OUT_OF_SERVICE',
    ).expect(200);

    expect(res.body.data).toEqual([
      { name: MACHINE_NAME, area: 'FUNCTIONAL', status: 'OUT_OF_SERVICE' },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/reason|changedBy|"id"/);
  });

  it('rechaza un área o un estado no válidos con 400', async () => {
    await availability(memberToken, '?area=YOGA').expect(400);
    await availability(memberToken, '?status=ROTA').expect(400);
  });

  it('un miembro sigue sin poder cambiar el estado (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/machines/${machineId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'OPERATIONAL', reason: 'Intento de miembro' })
      .expect(403);
  });

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/machines/availability')
      .expect(401);
  });
});
