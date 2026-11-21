import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';

/**
 * Prueba de integración de H25 contra la base de datos real.
 *
 * Requiere Postgres levantado, las migraciones aplicadas y el seed corrido
 * (miembros demo). Crea 22 avisos para ana.gomez y 1 para luis.martinez, y los
 * borra al terminar.
 */
const PASSWORD = 'Demo1234!';
const OWNER_EMAIL = 'ana.gomez@gymhub.test';
const OTHER_EMAIL = 'luis.martinez@gymhub.test';
const TITLE_PREFIX = 'H25 e2e';

interface InboxItem {
  id: number;
  title: string;
  message: string;
  source: string;
  createdAt: string;
  isRead: boolean;
}

describe('Bandeja de avisos · H25 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;
  let otherNotificationId: number;

  const login = async (email: string, password = PASSWORD): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  };

  const http = () => request(app.getHttpServer());

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
    ownerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } })
    ).id;
    otherId = (
      await prisma.user.findUniqueOrThrow({ where: { email: OTHER_EMAIL } })
    ).id;

    ownerToken = await login(OWNER_EMAIL);
    otherToken = await login(OTHER_EMAIL);
    // Desde H02 la contraseña del admin sale del .env (SEED_ADMIN_PASSWORD).
    adminToken = await login(
      'admin@gymhub.test',
      process.env.SEED_ADMIN_PASSWORD ?? PASSWORD,
    );
  });

  beforeEach(async () => {
    await cleanup();
    // 22 avisos sin leer para el dueño, con fechas distintas para el orden.
    const base = Date.UTC(2026, 10, 1, 12);
    await prisma.notification.createMany({
      data: Array.from({ length: 22 }, (_, i) => ({
        userId: ownerId,
        title: `${TITLE_PREFIX} ${i + 1}`,
        message: `Aviso de prueba ${i + 1}`,
        source: 'CLASSES' as const,
        createdAt: new Date(base + i * 60_000),
      })),
    });
    const other = await prisma.notification.create({
      data: {
        userId: otherId,
        title: `${TITLE_PREFIX} ajeno`,
        message: 'Aviso de otra persona',
        source: 'PAYMENTS',
      },
    });
    otherNotificationId = other.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    // Los avisos de prueba más cualquier aviso del dueño y del otro miembro,
    // para que los conteos no dependan de datos previos.
    await prisma.notification.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  }

  const unread = async (token: string): Promise<number> => {
    const res = await http()
      .get('/api/v1/notifications/me/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.unread as number;
  };

  it('lista mis avisos del más reciente al más antiguo, 20 por página', async () => {
    const first = await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(first.body).toMatchObject({ total: 22, page: 1, pageSize: 20 });
    const data = first.body.data as InboxItem[];
    expect(data).toHaveLength(20);
    expect(data[0].title).toBe(`${TITLE_PREFIX} 22`);
    expect(data[19].title).toBe(`${TITLE_PREFIX} 3`);
    expect(Object.keys(data[0]).sort()).toEqual(
      ['createdAt', 'id', 'isRead', 'message', 'source', 'title'].sort(),
    );
    expect(data[0]).toMatchObject({ source: 'CLASSES', isRead: false });

    const second = await http()
      .get('/api/v1/notifications/me?page=2')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((second.body.data as InboxItem[]).map((n) => n.title)).toEqual([
      `${TITLE_PREFIX} 2`,
      `${TITLE_PREFIX} 1`,
    ]);
  });

  it('no muestra avisos de otra persona', async () => {
    const res = await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect((res.body.data as InboxItem[])[0].title).toBe(
      `${TITLE_PREFIX} ajeno`,
    );
  });

  it('sin avisos responde una lista vacía', async () => {
    await prisma.notification.deleteMany({ where: { userId: otherId } });

    const res = await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
    expect(await unread(otherToken)).toBe(0);
  });

  it('marcar uno como leído baja el contador en 1', async () => {
    expect(await unread(ownerToken)).toBe(22);
    const list = await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const id = (list.body.data as InboxItem[])[0].id;

    await http()
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    expect(await unread(ownerToken)).toBe(21);

    // Marcarlo otra vez no cambia nada.
    await http()
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    expect(await unread(ownerToken)).toBe(21);

    const after = await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((after.body.data as InboxItem[])[0].isRead).toBe(true);
  });

  it('read-all deja el contador en 0 sin tocar los avisos de otra persona', async () => {
    await http()
      .patch('/api/v1/notifications/me/read-all')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    expect(await unread(ownerToken)).toBe(0);
    expect(await unread(otherToken)).toBe(1);
  });

  it('marcar un aviso de otro usuario responde 404 y no lo marca', async () => {
    const res = await http()
      .patch(`/api/v1/notifications/${otherNotificationId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    expect(res.body.message).toBe('No encontramos ese aviso.');
    expect(await unread(otherToken)).toBe(1);
  });

  it('marcar un aviso que no existe responde 404', async () => {
    await http()
      .patch('/api/v1/notifications/999999999/read')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('sin sesión responde 401', async () => {
    await http().get('/api/v1/notifications/me').expect(401);
    await http().get('/api/v1/notifications/me/unread-count').expect(401);
    await http().patch('/api/v1/notifications/me/read-all').expect(401);
  });

  it('un usuario que no es Miembro recibe 403', async () => {
    await http()
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('una página no válida responde 400', async () => {
    await http()
      .get('/api/v1/notifications/me?page=0')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });
});
