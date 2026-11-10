import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { FileStorage } from '../src/integrations/supabase/file-storage.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test); sign-in and storage are faked.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@biz.example.com` };
  },
};
const stored = new Set<string>();
const fakeStorage: FileStorage = {
  upload: async (path) => {
    stored.add(path);
    return `https://files.test/object/public/campaign-media/${path}`;
  },
  removeByUrl: async (urls) => {
    urls.forEach((u) => stored.delete(u.split('/campaign-media/')[1]));
  },
  isOurs: (url) => url.startsWith('https://files.test/object/public/campaign-media/'),
  download: async () => Buffer.from('logo'),
};

describe('Business profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());
  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .overrideProvider(FileStorage)
      .useValue(fakeStorage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { endsWith: '@biz.example.com' } } });
    await http().get('/v1/users/me').set(as('luna')).expect(200);
    await prisma.user.update({
      where: { authId: idFor('luna') },
      data: { role: 'BUSINESS', onboardedAt: new Date(), businessProfile: { create: { city: 'Testville', category: 'bakery' } } },
    });
    await http().get('/v1/users/me').set(as('maya')).expect(200);
    await prisma.user.update({ where: { authId: idFor('maya') }, data: { role: 'CREATOR', onboardedAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@biz.example.com' } } });
    await app.close();
  });

  it('uploads a logo, replaces it and removes it', async () => {
    const first = await http().post('/v1/business/profile/logo').set(as('luna')).attach('file', png, { filename: 'logo.png', contentType: 'image/png' }).expect(200);
    const url1 = first.body.data.businessProfile.logoUrl as string;
    expect(url1).toMatch(/\/businesses\/.+\/logo-\d+\.png$/);

    const second = await http().post('/v1/business/profile/logo').set(as('luna')).attach('file', png, { filename: 'logo.png', contentType: 'image/png' }).expect(200);
    expect(second.body.data.businessProfile.logoUrl).not.toBe(url1);
    expect(stored.has(url1.split('/campaign-media/')[1])).toBe(false);

    const removed = await http().delete('/v1/business/profile/logo').set(as('luna')).expect(200);
    expect(removed.body.data.businessProfile.logoUrl).toBeNull();
    expect(stored.size).toBe(0);
  });

  it('saves details, cleans what was typed and explains mistakes', async () => {
    const res = await http()
      .patch('/v1/business/profile')
      .set(as('luna'))
      .send({
        name: "  Lola Nena's Lechon House ",
        ownerFirstName: 'Nena',
        ownerLastName: 'Santos',
        contactMobile: '0917 555 0142',
        contactEmail: 'Hello@LolaNenas.ph',
        landline: '(032) 345 6789',
        street: '128 Gov. M. Cuenco Ave.',
        barangay: 'Talamban',
        city: 'Cebu City',
        landmark: 'Across Talamban Barangay Hall, blue gate',
        latitude: 10.3533,
        longitude: 123.9118,
        socials: { tiktok: 'https://www.tiktok.com/@lolanenacebu', facebook: "Lola Nena's Lechon House" },
      })
      .expect(200);
    expect(res.body.data.name).toBe("Lola Nena's Lechon House");
    expect(res.body.data.businessProfile).toMatchObject({
      contactMobile: '+639175550142',
      contactEmail: 'hello@lolanenas.ph',
      city: 'Cebu City',
      latitude: 10.3533,
      socials: { tiktok: '@lolanenacebu', facebook: "Lola Nena's Lechon House" },
    });

    // Clearing one field leaves the rest.
    const cleared = await http().patch('/v1/business/profile').set(as('luna')).send({ landline: '', socials: { tiktok: '' } }).expect(200);
    expect(cleared.body.data.businessProfile).toMatchObject({ landline: null, ownerFirstName: 'Nena', socials: { facebook: "Lola Nena's Lechon House" } });

    const bad = await http().patch('/v1/business/profile').set(as('luna')).send({ contactMobile: 'call me', city: '', latitude: 10 }).expect(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([expect.stringContaining('contactMobile'), 'city cannot be empty', 'latitude and longitude go together']),
    );
    await http().patch('/v1/business/profile').set(as('maya')).send({ name: 'x' }).expect(403);
  });

  it('rejects other files and other roles', async () => {
    const res = await http().post('/v1/business/profile/logo').set(as('luna')).attach('file', Buffer.from('x'), { filename: 'a.gif', contentType: 'image/gif' }).expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
    await http().post('/v1/business/profile/logo').set(as('luna')).expect(400);
    await http().post('/v1/business/profile/logo').set(as('maya')).attach('file', png, { filename: 'logo.png', contentType: 'image/png' }).expect(403);
  });
});
