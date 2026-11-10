import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test); only Supabase sign-in is faked.
// The seven starting content types come from the migration.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@ct.example.com` };
  },
};

const newType = {
  slug: 'test-live-selling',
  name: 'Live Selling',
  description: 'Creator goes live to show and sell your product.',
  example: 'A one hour TikTok Live for a clothing brand.',
  deliverables: [{ format: 'VIDEO', count: 1, minSeconds: 600, maxSeconds: 3600 }],
  sortOrder: 80,
};

describe('Content types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());

  const cleanUp = async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@ct.example.com' } } });
    await prisma.contentType.deleteMany({ where: { slug: { startsWith: 'test-' } } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await cleanUp();

    await http().get('/v1/users/me').set(as('boss')).expect(200);
    await prisma.user.update({ where: { authId: idFor('boss') }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('needs a signed-in user', async () => {
    await http().get('/v1/content-types').expect(401);
  });

  it('lists the starting types in order, with previews and deliverables', async () => {
    const res = await http().get('/v1/content-types').set(as('shop')).expect(200);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs.slice(0, 7)).toEqual([
      'sponsored-content',
      'product-review',
      'ugc',
      'affiliate',
      'store-visit',
      'trend-challenge',
      'brand-ambassador',
    ]);
    const ugc = res.body.data.find((t: { slug: string }) => t.slug === 'ugc');
    expect(ugc).toMatchObject({
      name: 'UGC (Content for Your Brand)',
      imageUrl: '/static/content-types/ugc.jpg',
      postsOnCreatorAccount: false,
      requiresVisit: false,
      active: true,
    });
    expect(ugc.deliverables).toEqual([{ format: 'VIDEO', count: 2, minSeconds: 15, maxSeconds: 30 }]);
    const visit = res.body.data.find((t: { slug: string }) => t.slug === 'store-visit');
    expect(visit.deliverables[1]).toEqual({ format: 'PHOTO', count: 3 });
    const ambassador = res.body.data.find((t: { slug: string }) => t.slug === 'brand-ambassador');
    expect(ambassador.defaultDurationDays).toBe(90);
    expect(res.body.data.find((t: { slug: string }) => t.slug === 'affiliate').defaultPayment).toBe('COMMISSION');
    expect(visit.defaultPayment).toBe('HYBRID');
  });

  it('starts with every type on every platform, worded without a platform name', async () => {
    const res = await http().get('/v1/content-types').set(as('shop')).expect(200);
    const sponsored = res.body.data.find((t: { slug: string }) => t.slug === 'sponsored-content');
    expect(sponsored.platforms).toEqual(['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK']);
    expect(sponsored.deliverables[0].format).toBe('VIDEO');
    expect(sponsored.defaultDurationDays).toBe(14);
  });

  it('only returns types that work on every picked platform', async () => {
    await http()
      .post('/v1/admin/content-types')
      .set(as('boss'))
      .send({ ...newType, slug: 'test-tiktok-only', platforms: ['TIKTOK'] })
      .expect(201);

    const both = await http().get('/v1/content-types?platforms=TIKTOK,INSTAGRAM').set(as('shop')).expect(200);
    const bothSlugs = both.body.data.map((t: { slug: string }) => t.slug);
    expect(bothSlugs).toContain('ugc');
    expect(bothSlugs).not.toContain('test-tiktok-only');

    const tiktok = await http().get('/v1/content-types?platforms=TIKTOK').set(as('shop')).expect(200);
    expect(tiktok.body.data.map((t: { slug: string }) => t.slug)).toContain('test-tiktok-only');

    const bad = await http().get('/v1/content-types?platforms=MYSPACE').set(as('shop')).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('serves the preview pictures', async () => {
    const res = await http().get('/static/content-types/sponsored-content.jpg').expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });

  it('keeps admin routes for admins only', async () => {
    await http().get('/v1/admin/content-types').set(as('shop')).expect(403);
    await http().post('/v1/admin/content-types').set(as('shop')).send(newType).expect(403);
  });

  it('lets an admin add, edit and hide a type', async () => {
    const created = await http().post('/v1/admin/content-types').set(as('boss')).send(newType).expect(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({
      slug: 'test-live-selling',
      active: true,
      postsOnCreatorAccount: true,
      defaultPayment: 'FIXED',
    });

    const edited = await http()
      .patch(`/v1/admin/content-types/${id}`)
      .set(as('boss'))
      .send({ name: 'Live Selling Session', deliverables: [{ format: 'PHOTO', count: 2, minSeconds: 10 }] })
      .expect(200);
    expect(edited.body.data).toMatchObject({ name: 'Live Selling Session', slug: 'test-live-selling' });
    // Photos have no length, so it is dropped.
    expect(edited.body.data.deliverables).toEqual([{ format: 'PHOTO', count: 2 }]);

    let list = await http().get('/v1/content-types').set(as('shop')).expect(200);
    expect(list.body.data.some((t: { id: string }) => t.id === id)).toBe(true);

    await http().patch(`/v1/admin/content-types/${id}`).set(as('boss')).send({ active: false }).expect(200);
    list = await http().get('/v1/content-types').set(as('shop')).expect(200);
    expect(list.body.data.some((t: { id: string }) => t.id === id)).toBe(false);

    const all = await http().get('/v1/admin/content-types').set(as('boss')).expect(200);
    expect(all.body.data.find((t: { id: string }) => t.id === id)).toMatchObject({ active: false });
  });

  it('refuses a slug that is already used', async () => {
    const res = await http()
      .post('/v1/admin/content-types')
      .set(as('boss'))
      .send({ ...newType, slug: 'ugc' })
      .expect(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('validates input', async () => {
    const res = await http()
      .post('/v1/admin/content-types')
      .set(as('boss'))
      .send({ ...newType, slug: 'Bad Slug', platforms: [], defaultPayment: 'BARTER', deliverables: [{ format: 'GIF', count: 0 }] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const upsideDown = await http()
      .post('/v1/admin/content-types')
      .set(as('boss'))
      .send({ ...newType, slug: 'test-upside-down', deliverables: [{ format: 'VIDEO', count: 1, minSeconds: 60, maxSeconds: 30 }] })
      .expect(400);
    expect(upsideDown.body.error.code).toBe('VALIDATION_ERROR');

    const slugChange = await http()
      .patch('/v1/admin/content-types/00000000-0000-4000-8000-000000000000')
      .set(as('boss'))
      .send({ slug: 'new-slug' })
      .expect(400);
    expect(slugChange.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 404 for an unknown type', async () => {
    await http()
      .patch('/v1/admin/content-types/00000000-0000-4000-8000-000000000000')
      .set(as('boss'))
      .send({ name: 'Nope' })
      .expect(404);
  });
});
