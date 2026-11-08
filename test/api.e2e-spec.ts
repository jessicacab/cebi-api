import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test); only Supabase sign-in is faked.
// A token "test|<name>" signs in as a made-up Supabase user for <name>.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@example.com` };
  },
};

describe('Cebi API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
    await app.close();
  });

  it('GET /health reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('rejects requests without a token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/users/me').expect(401);
    expect(res.body.error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });

  it('rejects an invalid token', async () => {
    await request(app.getHttpServer())
      .get('/v1/users/me')
      .set({ Authorization: 'Bearer nope' })
      .expect(401);
  });

  it('creates the user on first call', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set(as('maya'))
      .expect(200);
    expect(res.body.data).toMatchObject({
      authId: idFor('maya'),
      email: 'maya@example.com',
      role: null,
      status: 'ACTIVE',
    });
  });

  it('lets a user pick creator/business once', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/users/me')
      .set(as('maya'))
      .send({ name: 'Maya', role: 'CREATOR' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Maya', role: 'CREATOR' });

    const again = await request(app.getHttpServer())
      .patch('/v1/users/me')
      .set(as('maya'))
      .send({ role: 'BUSINESS' })
      .expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it('refuses to let a user make themselves admin', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/users/me')
      .set(as('maya'))
      .send({ role: 'ADMIN' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown fields', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/users/me')
      .set(as('maya'))
      .send({ status: 'ACTIVE' })
      .expect(400);
    expect(res.body.error.details).toContain('property status should not exist');
  });

  it('keeps admin routes for admins only', async () => {
    await request(app.getHttpServer()).get('/v1/admin/users').set(as('maya')).expect(403);

    await request(app.getHttpServer()).get('/v1/users/me').set(as('boss'));
    await prisma.user.update({ where: { authId: idFor('boss') }, data: { role: 'ADMIN' } });

    const res = await request(app.getHttpServer())
      .get('/v1/admin/users?role=CREATOR&pageSize=5')
      .set(as('boss'))
      .expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    expect(res.body.data.map((u: { authId: string }) => u.authId)).toContain(idFor('maya'));
  });

  it('lets an admin suspend a user, who is then locked out', async () => {
    const maya = await prisma.user.findUniqueOrThrow({ where: { authId: idFor('maya') } });
    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${maya.id}`)
      .set(as('boss'))
      .send({ status: 'SUSPENDED' })
      .expect(200);

    await request(app.getHttpServer()).get('/v1/users/me').set(as('maya')).expect(403);
  });

  it('returns 404 in the standard shape for a missing user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/users/00000000-0000-4000-8000-000000000000')
      .set(as('boss'))
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
