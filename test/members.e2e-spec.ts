import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Members (e2e)', () => {
  let app: INestApplication;
  let receptionToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@gymhub.test', password: 'Demo1234!' });
    receptionToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const member = () => ({
    fullName: 'Pedro Test',
    sex: 'M',
    birthDate: '1999-05-20',
    email: `pedro.${Date.now()}.${Math.random()}@example.com`,
  });

  it('201 con código GYM y password temporal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(member());

    expect(res.status).toBe(201);
    expect(res.body.memberCode).toMatch(/^GYM-\d{6}$/);
    expect(res.body.temporaryPassword).toHaveLength(10);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('409 cuando el correo ya existe (aunque cambie el nombre)', async () => {
    const payload = member();
    await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${receptionToken}`).send(payload);
    const res = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${receptionToken}`)
      .send({ ...payload, fullName: 'Otro Nombre' });
    expect(res.status).toBe(409);
  });

  it('400 con fecha de nacimiento futura', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${receptionToken}`)
      .send({ ...member(), birthDate: '2999-01-01' });
    expect(res.status).toBe(400);
  });

  it('400 si el body trae una propiedad no declarada (ej. role)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${receptionToken}`)
      .send({ ...member(), role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('403 con rol Miembro', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: 'miembro@gymhub.test', password: 'Demo1234!' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${login.body.accessToken}`).send(member());
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/members').send(member());
    expect(res.status).toBe(401);
  });
});