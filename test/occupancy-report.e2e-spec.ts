import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H28 (ocupación de las clases) contra la base real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propias clases en el año 2020, donde no hay datos del seed ni de
 * otras pruebas, así los porcentajes se pueden comparar exactos. Las borra al
 * terminar.
 */
const PASSWORD = 'Demo1234!';
const PREFIX = '[e2e H28]';
const MEMBER_EMAILS = [
  'miembro@gymhub.test',
  'ana.gomez@gymhub.test',
  'luis.martinez@gymhub.test',
];

interface ClassSeed {
  name: string;
  /** Fecha y hora de inicio en El Salvador (UTC-6), "YYYY-MM-DDTHH:mm". */
  startsAt: string;
  capacity: number;
  confirmed: number;
  cancelledReservations?: number;
  cancelled?: boolean;
}

/** Enero 2020: 7 nombres (se resaltan 3 y 3) y un empate en 50 %. */
const JANUARY: ClassSeed[] = [
  { name: 'Alfa', startsAt: '2020-01-06T07:00', capacity: 3, confirmed: 3 },
  { name: 'Bravo', startsAt: '2020-01-07T07:00', capacity: 4, confirmed: 3 },
  { name: 'Bravo', startsAt: '2020-01-14T07:00', capacity: 4, confirmed: 3 },
  { name: 'Charlie', startsAt: '2020-01-08T09:00', capacity: 3, confirmed: 2 },
  // Eco se crea antes que Delta: el orden por nombre no depende del de la base.
  { name: 'Eco', startsAt: '2020-01-09T17:00', capacity: 4, confirmed: 2 },
  { name: 'Delta', startsAt: '2020-01-10T17:00', capacity: 4, confirmed: 2 },
  {
    name: 'Foxtrot',
    startsAt: '2020-01-13T08:00',
    capacity: 6,
    confirmed: 1,
    cancelledReservations: 1,
  },
  { name: 'Golf', startsAt: '2020-01-15T19:00', capacity: 10, confirmed: 1 },
  // Cancelada: no cuenta, aunque se llame igual que una clase que sí.
  {
    name: 'Alfa',
    startsAt: '2020-01-20T07:00',
    capacity: 10,
    confirmed: 0,
    cancelled: true,
  },
];

/** Marzo 2020: menos de 6 nombres. Uno empieza el 31/03 a las 21:00 en El Salvador (1/04 en UTC). */
const MARCH: ClassSeed[] = [
  { name: 'Uno', startsAt: '2020-03-31T21:00', capacity: 3, confirmed: 3 },
  { name: 'Dos', startsAt: '2020-03-10T07:00', capacity: 4, confirmed: 2 },
  { name: 'Tres', startsAt: '2020-03-12T07:00', capacity: 5, confirmed: 1 },
];

describe('Reportes · H28 ocupación de las clases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let trainerId: string;
  let memberIds: string[];

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const occupancy = (token: string | null, query: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/reports/occupancy${query}`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function createClass(item: ClassSeed): Promise<void> {
    const startsAt = new Date(`${item.startsAt}:00-06:00`);
    const gymClass = await prisma.gymClass.create({
      data: {
        name: `${PREFIX} ${item.name}`,
        trainerId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        capacity: item.capacity,
        status: item.cancelled ? 'CANCELLED' : 'SCHEDULED',
        cancellationReason: item.cancelled ? 'Prueba e2e H28' : null,
      },
    });
    for (const memberId of memberIds.slice(0, item.confirmed)) {
      await prisma.classReservation.create({
        data: { classId: gymClass.id, memberId },
      });
    }
    for (let i = 0; i < (item.cancelledReservations ?? 0); i++) {
      await prisma.classReservation.create({
        data: {
          classId: gymClass.id,
          memberId: memberIds[memberIds.length - 1 - i],
          status: 'CANCELLED',
          cancelledAt: startsAt,
        },
      });
    }
  }

  async function cleanUp(): Promise<void> {
    const own = { name: { startsWith: PREFIX } };
    await prisma.classReservation.deleteMany({ where: { gymClass: own } });
    await prisma.gymClass.deleteMany({ where: own });
  }

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

    trainerId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'entrenador2@gymhub.test' },
      })
    ).id;
    memberIds = await Promise.all(
      MEMBER_EMAILS.map(
        async (email) =>
          (await prisma.user.findUniqueOrThrow({ where: { email } })).id,
      ),
    );
    adminToken = await login('admin@gymhub.test');

    await cleanUp();
    for (const item of [...JANUARY, ...MARCH]) await createClass(item);
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('agrupa por nombre, da el porcentaje con un decimal y ordena de mayor a menor', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-01-01&to=2020-01-31',
    ).expect(200);

    expect(
      res.body.classes.map((item: { name: string }) =>
        item.name.replace(`${PREFIX} `, ''),
      ),
    ).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Foxtrot', 'Golf']);
    expect(
      res.body.classes.map(
        (item: { occupancyPercent: number }) => item.occupancyPercent,
      ),
    ).toEqual([100, 75, 66.7, 50, 50, 16.7, 10]);
    expect(res.body.classes[1]).toEqual({
      name: `${PREFIX} Bravo`,
      sessions: 2,
      capacity: 8,
      confirmedReservations: 6,
      occupancyPercent: 75,
      level: 'HIGH',
    });
  });

  it('con 6 clases o más resalta las 3 de mayor y las 3 de menor ocupación', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-01-01&to=2020-01-31',
    ).expect(200);
    expect(
      res.body.classes.map((item: { level: string | null }) => item.level),
    ).toEqual(['HIGH', 'HIGH', 'HIGH', null, 'LOW', 'LOW', 'LOW']);
  });

  it('no cuenta clases canceladas ni reservas canceladas', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-01-01&to=2020-01-31',
    ).expect(200);
    const byName = (name: string) =>
      res.body.classes.find(
        (item: { name: string }) => item.name === `${PREFIX} ${name}`,
      );
    expect(byName('Alfa')).toMatchObject({ sessions: 1, capacity: 3 });
    expect(byName('Foxtrot')).toMatchObject({
      confirmedReservations: 1,
      occupancyPercent: 16.7,
    });
    expect(res.body.totals).toEqual({
      classCount: 7,
      sessions: 8,
      capacity: 38,
      confirmedReservations: 17,
      occupancyPercent: 44.7,
    });
  });

  it('con menos de 6 clases marca la mitad superior como mayor y el resto como menor', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-03-01&to=2020-03-31',
    ).expect(200);
    expect(
      res.body.classes.map(
        (item: { name: string; level: string }) =>
          `${item.name.replace(`${PREFIX} `, '')} ${item.level}`,
      ),
    ).toEqual(['Uno HIGH', 'Dos HIGH', 'Tres LOW']);
  });

  it('usa la fecha de inicio en El Salvador: la clase del 31/03 a las 21:00 no cuenta en abril', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-04-01&to=2020-04-30',
    ).expect(404);
    expect(res.body.message).toBe('No hay clases en ese rango.');
  });

  it('un rango sin clases no genera el reporte y muestra el motivo', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-06-01&to=2020-06-30',
    ).expect(404);
    expect(res.body.message).toBe('No hay clases en ese rango.');
  });

  it('una clase que todavía no termina no cuenta', async () => {
    const day = new Date(Date.now() + 40 * 24 * 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    // Sin reservas, para no cruzarse con otras pruebas e2e que corren en paralelo.
    await createClass({
      name: 'Futura',
      startsAt: `${day}T05:00`,
      capacity: 5,
      confirmed: 0,
    });
    const res = await occupancy(adminToken, `?from=${day}&to=${day}`).expect(
      404,
    );
    expect(res.body.message).toBe('No hay clases en ese rango.');
  });

  it('acepta hasta 12 meses', async () => {
    const res = await occupancy(
      adminToken,
      '?from=2020-01-01&to=2020-12-31',
    ).expect(200);
    expect(res.body.totals.classCount).toBe(10);
  });

  it.each([
    [
      '?from=2020-03-31&to=2020-01-01',
      'La fecha de inicio no puede ser posterior a la de fin.',
    ],
    [
      '?from=2020-01-01&to=2021-01-01',
      'El rango no puede ser mayor a 12 meses.',
    ],
    ['?from=2021-02-29&to=2021-03-10', 'La fecha 2021-02-29 no existe.'],
  ])('con %s responde 400 con el motivo', async (query, message) => {
    const res = await occupancy(adminToken, query).expect(400);
    expect(res.body.message).toBe(message);
  });

  it.each(['?from=01/01/2020&to=2020-03-31', '?from=2020-01-01', ''])(
    'con fechas en otro formato o faltantes (%s) responde 400',
    async (query) => {
      await occupancy(adminToken, query).expect(400);
    },
  );

  it.each([
    'recepcion@gymhub.test',
    'entrenador@gymhub.test',
    'miembro@gymhub.test',
  ])('%s no puede ver el reporte (403)', async (email) => {
    const token = await login(email);
    await occupancy(token, '?from=2020-01-01&to=2020-01-31').expect(403);
  });

  it('sin sesión responde 401', async () => {
    await occupancy(null, '?from=2020-01-01&to=2020-01-31').expect(401);
  });
});
