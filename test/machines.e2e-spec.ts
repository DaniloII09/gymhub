import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H20 contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido
 * (usuarios demo y las 8 máquinas). Usa la máquina FUN-002 y la deja como la
 * encontró al terminar.
 */
const PASSWORD = 'Demo1234!';
const MACHINE_CODE = 'FUN-002';

describe('Máquinas · H20 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let receptionToken: string;
  let machineId: number;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

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
    receptionToken = await login('recepcion@gymhub.test');
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

  const changeStatus = (token: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/machines/${machineId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('lista el inventario ordenado por área y nombre', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/machines?area=FUNCTIONAL')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.data.map((m: { name: string }) => m.name)).toEqual([
      'Rack de sentadillas',
      'Remo funcional',
    ]);
  });

  it('cada cambio exitoso agrega exactamente un registro al historial', async () => {
    const res = await changeStatus(adminToken, {
      status: 'UNDER_MAINTENANCE',
      reason: 'Cambio de cable',
    }).expect(200);

    expect(res.body).toMatchObject({
      machineId,
      status: 'UNDER_MAINTENANCE',
      changedBy: 'admin@gymhub.test',
    });
    await expect(
      prisma.machineStatusChange.count({ where: { machineId } }),
    ).resolves.toBe(1);

    await changeStatus(adminToken, {
      status: 'OPERATIONAL',
      reason: 'Reparada y probada',
    }).expect(200);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/machines/${machineId}/status-history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(history.body.data).toHaveLength(2);
    // Del más reciente al más antiguo.
    expect(history.body.data[0]).toMatchObject({
      fromStatus: 'UNDER_MAINTENANCE',
      toStatus: 'OPERATIONAL',
      reason: 'Reparada y probada',
    });
  });

  it('sin motivo retorna 400 y el estado no cambia', async () => {
    const res = await changeStatus(adminToken, {
      status: 'OUT_OF_SERVICE',
      reason: '   ',
    }).expect(400);

    expect(res.body.message).toEqual(['Escribe el motivo del cambio.']);
    const machine = await prisma.machine.findUniqueOrThrow({
      where: { id: machineId },
    });
    expect(machine.status).toBe('OPERATIONAL');
  });

  it('el mismo estado retorna 409', async () => {
    const res = await changeStatus(adminToken, {
      status: 'OPERATIONAL',
      reason: 'Sigue igual',
    }).expect(409);

    expect(res.body.message).toBe('La máquina ya está en ese estado.');
  });

  it('una máquina que no existe retorna 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/machines/999999/status-history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('con rol Recepción retorna 403', async () => {
    await changeStatus(receptionToken, {
      status: 'OUT_OF_SERVICE',
      reason: 'No debería poder',
    }).expect(403);
  });

  it('sin sesión retorna 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/machines').expect(401);
  });
});
