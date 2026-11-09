import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const ADMIN = { email: 'admin@gymhub.test', password: 'Demo1234!' };

describe('Staff (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send(ADMIN);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => { await app.close(); });

  const staff = () => ({
    fullName: 'Nuevo Entrenador',
    email: `trainer.${Date.now()}.${Math.random()}@gym.local`,
    role: 'TRAINER',
  });

  it('/auth/me devuelve el rol del admin (BE-2.1)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('POST /users ya no existe -> 404 (BE-2.1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users').set('Authorization', `Bearer ${adminToken}`).send({ email: 'x@y.com', password: 'Whatever1' });
    expect(res.status).toBe(404);
  });

  it('201 crea personal con contraseña temporal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/staff').set('Authorization', `Bearer ${adminToken}`).send(staff());
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toHaveLength(10);
    expect(res.body.role).toBe('TRAINER');
  });

  it('400 al crear con rol MEMBER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/staff').set('Authorization', `Bearer ${adminToken}`).send({ ...staff(), role: 'MEMBER' });
    expect(res.status).toBe(400);
  });

  it('409 con correo repetido', async () => {
    const payload = staff();
    await request(app.getHttpServer()).post('/api/v1/staff').set('Authorization', `Bearer ${adminToken}`).send(payload);
    const res = await request(app.getHttpServer())
      .post('/api/v1/staff').set('Authorization', `Bearer ${adminToken}`).send({ ...payload, fullName: 'Otro' });
    expect(res.status).toBe(409);
  });

  it('403 si no es Administrador', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: 'miembro@gymhub.test', password: 'Demo1234!' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/staff').set('Authorization', `Bearer ${login.body.accessToken}`).send(staff());
    expect(res.status).toBe(403);
  });

  it('GET /staff lista paginado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/staff?page=1&pageSize=20').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('desactivar impide el login de esa cuenta', async () => {
    const payload = staff();
    const created = await request(app.getHttpServer())
      .post('/api/v1/staff').set('Authorization', `Bearer ${adminToken}`).send(payload);
    const { id, temporaryPassword } = created.body;

    const before = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: payload.email, password: temporaryPassword });
    expect(before.status).toBe(200);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/users/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.isActive).toBe(false);

    const after = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: payload.email, password: temporaryPassword });
    expect(after.status).toBe(401);
  });

  it('403 al desactivar la propia cuenta', async () => {
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${me.body.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(res.status).toBe(403);
  });
});