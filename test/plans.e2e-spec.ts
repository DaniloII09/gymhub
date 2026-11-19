import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const ADMIN = { email: 'admin@gymhub.test', password: 'Demo1234!' };
const MEMBER = { email: 'miembro@gymhub.test', password: 'Demo1234!' };

describe('Plans (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  // Nombre único por corrida (máx. 40): las pruebas no chocan con datos previos.
  const uniqueName = (prefix: string) =>
    `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const monthly = (overrides: object = {}) => ({
    name: uniqueName('Mensual'),
    type: 'MONTHLY',
    durationDays: 30,
    price: 25,
    benefits: 'Acceso ilimitado',
    ...overrides,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    adminToken = (await api().post('/api/v1/auth/login').send(ADMIN)).body.accessToken;
    memberToken = (await api().post('/api/v1/auth/login').send(MEMBER)).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /plans', () => {
    it('cualquier usuario con sesión ve los 3 planes iniciales activos', async () => {
      const res = await api()
        .get('/api/v1/plans?active=true')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(200);
      const names = res.body.data.map((p: { name: string }) => p.name);
      expect(names).toEqual(expect.arrayContaining(['Mensual', 'Trimestral', 'Clase suelta']));
      expect(res.body.data.every((p: { isActive: boolean }) => p.isActive)).toBe(true);

      const dropIn = res.body.data.find((p: { type: string }) => p.type === 'DROP_IN');
      expect(dropIn).toMatchObject({ durationDays: null, price: 5 });
    });

    it('sin sesión responde 401', async () => {
      expect((await api().get('/api/v1/plans')).status).toBe(401);
    });

    it('active con un valor inválido responde 400', async () => {
      expect((await asAdmin(api().get('/api/v1/plans?active=si'))).status).toBe(400);
    });
  });

  describe('POST /plans', () => {
    it('201 crea un plan activo que aparece en GET /plans?active=true', async () => {
      const payload = monthly();
      const res = await asAdmin(api().post('/api/v1/plans').send(payload));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: payload.name,
        type: 'MONTHLY',
        durationDays: 30,
        price: 25,
        isActive: true,
      });

      const list = await asAdmin(api().get('/api/v1/plans?active=true'));
      expect(list.body.data.map((p: { id: number }) => p.id)).toContain(res.body.id);
    });

    it('guarda el precio con 2 decimales', async () => {
      const res = await asAdmin(api().post('/api/v1/plans').send(monthly({ price: 19.99 })));
      expect(res.status).toBe(201);
      expect(res.body.price).toBe(19.99);
    });

    it('409 con un nombre repetido aunque cambien las mayúsculas', async () => {
      const payload = monthly();
      await asAdmin(api().post('/api/v1/plans').send(payload));
      const res = await asAdmin(
        api().post('/api/v1/plans').send({ ...payload, name: payload.name.toUpperCase() }),
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Ya existe un plan con ese nombre.');
    });

    it('409 al crear un segundo plan de clase suelta activo', async () => {
      const res = await asAdmin(
        api().post('/api/v1/plans').send({ name: uniqueName('Suelta'), type: 'DROP_IN', price: 6 }),
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Ya existe un plan de clase suelta activo.');
    });

    it.each([
      ['precio 0', { price: 0 }],
      ['duración 0', { durationDays: 0 }],
      ['duración 366', { durationDays: 366 }],
      ['sin duración en MONTHLY', { durationDays: undefined }],
      ['nombre de 2 caracteres', { name: 'Ab' }],
      ['propiedad no declarada', { isActive: false }],
    ])('400 con %s', async (_, overrides) => {
      const res = await asAdmin(api().post('/api/v1/plans').send(monthly(overrides)));
      expect(res.status).toBe(400);
    });

    it('400 con duración en un plan DROP_IN', async () => {
      const res = await asAdmin(
        api()
          .post('/api/v1/plans')
          .send({ name: uniqueName('Suelta'), type: 'DROP_IN', price: 5, durationDays: 1 }),
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(['La clase suelta no lleva duración.']);
    });

    it('403 si no es Administrador', async () => {
      const res = await api()
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${memberToken}`)
        .send(monthly());
      expect(res.status).toBe(403);
    });

    it('dos altas simultáneas con el mismo nombre: una 201 y otra 409', async () => {
      const payload = monthly();
      const results = await Promise.all([
        asAdmin(api().post('/api/v1/plans').send(payload)),
        asAdmin(api().post('/api/v1/plans').send({ ...payload, name: payload.name.toLowerCase() })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });
  });

  describe('PATCH /plans/:planId', () => {
    it('200 edita precio, duración y beneficios', async () => {
      const created = (await asAdmin(api().post('/api/v1/plans').send(monthly()))).body;
      const res = await asAdmin(
        api()
          .patch(`/api/v1/plans/${created.id}`)
          .send({ price: 27.5, durationDays: 31, benefits: null }),
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ price: 27.5, durationDays: 31, benefits: null });
    });

    it('400 si intenta cambiar el tipo', async () => {
      const created = (await asAdmin(api().post('/api/v1/plans').send(monthly()))).body;
      const res = await asAdmin(
        api().patch(`/api/v1/plans/${created.id}`).send({ type: 'QUARTERLY' }),
      );
      expect(res.status).toBe(400);
    });

    it('409 si el nombre nuevo ya es de otro plan', async () => {
      const created = (await asAdmin(api().post('/api/v1/plans').send(monthly()))).body;
      const res = await asAdmin(
        api().patch(`/api/v1/plans/${created.id}`).send({ name: 'TRIMESTRAL' }),
      );
      expect(res.status).toBe(409);
    });

    it('permite guardar el mismo nombre con otras mayúsculas', async () => {
      const created = (await asAdmin(api().post('/api/v1/plans').send(monthly()))).body;
      const res = await asAdmin(
        api().patch(`/api/v1/plans/${created.id}`).send({ name: created.name.toUpperCase() }),
      );
      expect(res.status).toBe(200);
    });

    it('404 si el plan no existe', async () => {
      const res = await asAdmin(api().patch('/api/v1/plans/999999').send({ price: 10 }));
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /plans/:planId/deactivate', () => {
    it('200 desactiva el plan y deja de aparecer en los activos', async () => {
      const created = (await asAdmin(api().post('/api/v1/plans').send(monthly()))).body;
      const res = await asAdmin(api().patch(`/api/v1/plans/${created.id}/deactivate`));
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);

      const active = await asAdmin(api().get('/api/v1/plans?active=true'));
      expect(active.body.data.map((p: { id: number }) => p.id)).not.toContain(created.id);
      const all = await asAdmin(api().get('/api/v1/plans'));
      expect(all.body.data.map((p: { id: number }) => p.id)).toContain(created.id);
    });

    it('403 si no es Administrador y 404 si el plan no existe', async () => {
      const forbidden = await api()
        .patch('/api/v1/plans/1/deactivate')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(forbidden.status).toBe(403);
      expect((await asAdmin(api().patch('/api/v1/plans/999999/deactivate'))).status).toBe(404);
    });
  });
});
