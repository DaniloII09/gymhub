import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { gymToday } from '@Payments/services';

/**
 * Prueba de integración de H17 (pagos pendientes) contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido.
 * Crea sus propios cobros para tres miembros y los borra al terminar. Otras
 * pruebas pueden crear cobros al mismo tiempo, así que las verificaciones
 * buscan los cobros propios en vez de contar filas exactas.
 */
const PASSWORD = 'Demo1234!';
const CONCEPT_PREFIX = '[e2e H17]';

interface PendingRow {
  chargeId: number;
  memberCode: string | null;
  fullName: string;
  concept: string;
  amount: number;
  dueDate: string;
  daysLate: number;
}

/** Fecha a `days` días de hoy en la zona del gimnasio, como columna DATE. */
const fromToday = (days: number): Date => {
  const today = new Date(`${gymToday()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() + days);
  return today;
};

describe('Pagos · H17 pagos pendientes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let receptionToken: string;
  let memberToken: string;
  const ids: Record<'juan' | 'ana' | 'luis', string> = {
    juan: '',
    ana: '',
    luis: '',
  };
  /** Cobros propios: vencido hace 6 días, hace 35 y que vence mañana. */
  let sixDaysLate: { id: number };
  let thirtyFiveDaysLate: { id: number };
  let dueTomorrow: { id: number };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const createCharge = (
    memberId: string,
    type: 'MEMBERSHIP' | 'PERSONAL_SESSION',
    amount: number,
    daysToDue: number,
  ) =>
    prisma.charge.create({
      data: {
        memberId,
        type,
        concept: `${CONCEPT_PREFIX} ${type} ${randomUUID().slice(0, 8)}`,
        amount,
        dueDate: fromToday(daysToDue),
      },
    });

  const listPending = (token: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/charges/pending${query}`)
      .set('Authorization', `Bearer ${token}`);

  const find = (rows: PendingRow[], chargeId: number) =>
    rows.find((row) => row.chargeId === chargeId);

  const sum = (rows: PendingRow[]) =>
    Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;

  async function cleanUp(): Promise<void> {
    await prisma.charge.deleteMany({
      where: { concept: { startsWith: CONCEPT_PREFIX } },
    });
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

    const idOf = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    ids.juan = await idOf('miembro@gymhub.test');
    ids.ana = await idOf('ana.gomez@gymhub.test');
    ids.luis = await idOf('luis.martinez@gymhub.test');
    await cleanUp();

    sixDaysLate = await createCharge(ids.ana, 'PERSONAL_SESSION', 15, -6);
    thirtyFiveDaysLate = await createCharge(ids.luis, 'MEMBERSHIP', 40, -35);
    dueTomorrow = await createCharge(ids.juan, 'MEMBERSHIP', 30, 1);

    adminToken = await login('admin@gymhub.test');
    receptionToken = await login('recepcion@gymhub.test');
    memberToken = await login('miembro@gymhub.test');
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('calcula los días de atraso: 6 días da 6 y mañana da 0', async () => {
    const res = await listPending(adminToken, '?pageSize=100').expect(200);
    const rows = res.body.data as PendingRow[];

    expect(find(rows, sixDaysLate.id)).toEqual({
      chargeId: sixDaysLate.id,
      memberCode: 'GYM-000002',
      fullName: 'Ana Gomez',
      concept: expect.stringContaining(CONCEPT_PREFIX) as string,
      amount: 15,
      dueDate: fromToday(-6).toISOString().slice(0, 10),
      daysLate: 6,
    });
    expect(find(rows, thirtyFiveDaysLate.id)?.daysLate).toBe(35);
    expect(find(rows, dueTomorrow.id)?.daysLate).toBe(0);
  });

  it('ordena de más a menos días de atraso y, con los mismos días, por nombre', async () => {
    const res = await listPending(adminToken, '?pageSize=100').expect(200);
    const rows = res.body.data as PendingRow[];

    for (let i = 1; i < rows.length; i++) {
      const [before, after] = [rows[i - 1], rows[i]];
      expect(before.daysLate).toBeGreaterThanOrEqual(after.daysLate);
      if (before.daysLate === after.daysLate) {
        expect(before.fullName <= after.fullName).toBe(true);
      }
    }
    const position = (id: number) => rows.findIndex((r) => r.chargeId === id);
    expect(position(thirtyFiveDaysLate.id)).toBeLessThan(
      position(sixDaysLate.id),
    );
    expect(position(sixDaysLate.id)).toBeLessThan(position(dueTomorrow.id));
  });

  it('el total adeudado coincide con la suma de los montos filtrados', async () => {
    const res = await listPending(adminToken, '?pageSize=100').expect(200);

    expect(res.body.total).toBeLessThanOrEqual(100);
    expect(res.body.data).toHaveLength(res.body.total);
    expect(res.body.totalOwed).toBe(sum(res.body.data as PendingRow[]));
  });

  it('el total adeudado suma todo el filtro, no solo la página', async () => {
    const res = await listPending(adminToken, '?page=1&pageSize=1').expect(200);

    expect(res.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(res.body.data).toHaveLength(1);
    // Solo los tres cobros propios ya suman 85.
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.totalOwed).toBeGreaterThanOrEqual(85);
    expect(res.body.totalOwed).toBeGreaterThan(res.body.data[0].amount);
  });

  it('por defecto pagina de 20 en 20', async () => {
    const res = await listPending(adminToken).expect(200);

    expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(res.body.data.length).toBeLessThanOrEqual(20);
  });

  it('el filtro por tipo solo deja ese tipo y recalcula el total adeudado', async () => {
    const res = await listPending(
      adminToken,
      '?type=PERSONAL_SESSION&pageSize=100',
    ).expect(200);
    const rows = res.body.data as PendingRow[];

    expect(find(rows, sixDaysLate.id)).toBeDefined();
    expect(find(rows, thirtyFiveDaysLate.id)).toBeUndefined();
    expect(find(rows, dueTomorrow.id)).toBeUndefined();
    expect(res.body.totalOwed).toBe(sum(rows));

    const savedTypes = await prisma.charge.findMany({
      where: { id: { in: rows.map((row) => row.chargeId) } },
      select: { type: true },
    });
    expect(new Set(savedTypes.map((charge) => charge.type))).toEqual(
      new Set(['PERSONAL_SESSION']),
    );
  });

  it('no lista cobros pagados', async () => {
    const paid = await prisma.charge.create({
      data: {
        memberId: ids.ana,
        type: 'MEMBERSHIP',
        concept: `${CONCEPT_PREFIX} pagado ${randomUUID().slice(0, 8)}`,
        amount: 99,
        dueDate: fromToday(-3),
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    const res = await listPending(adminToken, '?pageSize=100').expect(200);

    expect(find(res.body.data as PendingRow[], paid.id)).toBeUndefined();
  });

  it('un tipo no válido responde 400', async () => {
    await listPending(adminToken, '?type=DROP_IN').expect(400);
    await listPending(adminToken, '?type=MEMBRESIA').expect(400);
    await listPending(adminToken, '?page=0').expect(400);
  });

  it('solo el Administrador puede verlo: Recepción y Miembro 403, sin sesión 401', async () => {
    await listPending(receptionToken).expect(403);
    await listPending(memberToken).expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/charges/pending')
      .expect(401);
  });
});
