import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Password change (e2e)', () => {
  let app: INestApplication;
  let memberToken: string;
  let temporaryPassword: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email: 'admin@gymhub.test', password: 'Demo1234!' });

    const email = `pending.${Date.now()}@example.com`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ fullName: 'Pending User', sex: 'F', birthDate: '2000-03-03', email });
    temporaryPassword = created.body.temporaryPassword;

    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email, password: temporaryPassword });
    memberToken = memberLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloquea otros endpoints con 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${memberToken}`)
      .send({ fullName: 'X Y', sex: 'M', birthDate: '2000-01-01', email: `z.${Date.now()}@example.com` });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('400 si la contraseña actual es incorrecta', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/auth/password').set('Authorization', `Bearer ${memberToken}`)
      .send({ currentPassword: 'MalaPass9', newPassword: 'NuevaPass9' });
    expect(res.status).toBe(400);
  });

  it('204 cambia la contraseña y apaga la bandera', async () => {
    const change = await request(app.getHttpServer())
      .patch('/api/v1/auth/password').set('Authorization', `Bearer ${memberToken}`)
      .send({ currentPassword: temporaryPassword, newPassword: 'NuevaPass9' });
    expect(change.status).toBe(204);

    // Ya sin la bandera: ahora el 403 es por ROL, sin el code de cambio de pass.
    const after = await request(app.getHttpServer())
      .post('/api/v1/members').set('Authorization', `Bearer ${memberToken}`)
      .send({ fullName: 'X Y', sex: 'M', birthDate: '2000-01-01', email: `w.${Date.now()}@example.com` });
    expect(after.status).toBe(403);
    expect(after.body.code).not.toBe('PASSWORD_CHANGE_REQUIRED');
  });
});