import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { FileStorage } from '../src/integrations/supabase/file-storage.js';
import { todayInManila } from '../src/modules/campaigns/campaign-rules.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test); only Supabase sign-in is faked.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@cmp.example.com` };
  },
};

/** Keeps uploads in memory, so tests never touch Supabase Storage. */
const stored = new Map<string, string>();
const fakeStorage: FileStorage = {
  upload: async (path, _body, contentType) => {
    stored.set(path, contentType);
    return `https://files.test/object/public/campaign-media/${path}`;
  },
  removeByUrl: async (urls) => {
    urls.forEach((u) => stored.delete(u.split('/campaign-media/')[1]));
  },
  isOurs: (url) => url.startsWith('https://files.test/object/public/campaign-media/'),
  download: async () => Buffer.from('photo'),
};

/** A calendar day `n` days from today in Manila, like the app sends. */
const day = (n: number) => {
  const d = new Date(`${todayInManila()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sponsoredId: string;
  let ugcId: string;
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());

  const draft = () => ({
    contentTypeId: sponsoredId,
    title: 'Boodle Feast Launch',
    platforms: ['TIKTOK', 'INSTAGRAM'],
    deliverables: [{ format: 'VIDEO', count: 4, minSeconds: 30, maxSeconds: 60 }],
    hashtags: ['#BoodleFeastCebu'],
    tagBusiness: true,
    mentions: ['@chefjuan'],
    talkingPoints: ['Good for 4, only P999'],
    avoid: ["Don't show other restaurants"],
    link: 'BOODLE10',
    showLocation: true,
    reviewDrafts: true,
    revisions: 2,
    keepLiveDays: 30,
    payment: 'FIXED',
    cashPerCreator: 2500,
    slots: 5,
    applyBy: day(3),
    contentDue: day(6),
    publishStart: day(7),
    publishEnd: day(24),
    spreadEvenly: true,
    visitTimes: ['Sat 12 PM'],
  });

  const makeBusiness = async (who: string) => {
    await http().get('/v1/users/me').set(as(who)).expect(200);
    await prisma.user.update({
      where: { authId: idFor(who) },
      data: { role: 'BUSINESS', onboardedAt: new Date(), businessProfile: { create: { city: 'Testville', category: 'cafe' } } },
    });
  };

  const makeCreator = async (who: string, city: string, platforms: ('TIKTOK' | 'INSTAGRAM' | 'YOUTUBE')[]) => {
    await http().get('/v1/users/me').set(as(who)).expect(200);
    await prisma.user.update({
      where: { authId: idFor(who) },
      data: { role: 'CREATOR', onboardedAt: new Date(), creatorProfile: { create: { city, platforms } } },
    });
  };

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
    await prisma.user.deleteMany({ where: { email: { endsWith: '@cmp.example.com' } } });
    await prisma.contentType.deleteMany({ where: { slug: { startsWith: 'cmptest-' } } });

    sponsoredId = (await prisma.contentType.findUniqueOrThrow({ where: { slug: 'sponsored-content' } })).id;
    ugcId = (await prisma.contentType.findUniqueOrThrow({ where: { slug: 'ugc' } })).id;
    await makeBusiness('kape');
    await makeBusiness('other');
    await makeCreator('maya', 'Testville', ['TIKTOK']);
    await makeCreator('rio', 'testville', ['YOUTUBE']);
    await makeCreator('far', 'Elsewhere', ['TIKTOK']);
  });

  afterAll(async () => {
    // Campaigns go with their business (cascade).
    await prisma.user.deleteMany({ where: { email: { endsWith: '@cmp.example.com' } } });
    await prisma.contentType.deleteMany({ where: { slug: { startsWith: 'cmptest-' } } });
    await app.close();
  });

  it('is for businesses only', async () => {
    await http().get('/v1/business/campaigns').expect(401);
    await http().get('/v1/business/campaigns').set(as('maya')).expect(403);
  });

  it('saves a new campaign as a draft, with the cash to creators worked out', async () => {
    const res = await http().post('/v1/business/campaigns').set(as('kape')).send(draft()).expect(201);
    expect(res.body.data).toMatchObject({
      status: 'DRAFT',
      title: 'Boodle Feast Launch',
      contentType: { slug: 'sponsored-content', name: 'Sponsored Content' },
      applyBy: day(3),
      publishEnd: day(24),
      revisions: 2,
      // Sponsored content is not a visit, so location and visit times are dropped.
      showLocation: false,
      visitTimes: [],
      commissionPct: null,
      // Launch: no payments through Cebi, so no fee.
      cost: { cash: 12500, fee: 0, total: 12500, paidInApp: false },
      publishedAt: null,
    });
  });

  it('keeps only what applies when creators just hand over files (UGC)', async () => {
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({
        ...draft(),
        contentTypeId: ugcId,
        title: 'Ad videos',
        publishStart: undefined,
        publishEnd: undefined,
        keepLiveDays: undefined,
        adUsageDays: 365,
        payment: 'HYBRID',
        hybridParts: ['FIXED', 'PRODUCT'],
        product: 'Skincare set',
        productValue: 1500,
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      hashtags: [],
      mentions: [],
      tagBusiness: false,
      keepLiveDays: null,
      publishStart: null,
      adUsageDays: 365,
      payment: 'HYBRID',
      hybridParts: ['FIXED', 'PRODUCT'],
      product: 'Skincare set',
    });
  });

  it('explains what is wrong with the dates and pay', async () => {
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({ ...draft(), applyBy: day(-1), payment: 'COMMISSION', publishEnd: day(5) })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        'applyBy can not be in the past',
        'commissionPct is required for a commission',
        'contentDue can not be after publishEnd',
      ]),
    );
  });

  it('refuses a type that is not on the picked platforms, or is hidden', async () => {
    const tiktokOnly = await prisma.contentType.create({
      data: { slug: 'cmptest-tiktok-only', name: 'TikTok Only', description: 'x', example: 'x', platforms: ['TIKTOK'], sortOrder: 999 },
    });
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({ ...draft(), contentTypeId: tiktokOnly.id })
      .expect(400);
    expect(res.body.error.details).toContain('TikTok Only is not available on INSTAGRAM');

    await prisma.contentType.update({ where: { id: tiktokOnly.id }, data: { active: false } });
    const hidden = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({ ...draft(), platforms: ['TIKTOK'], contentTypeId: tiktokOnly.id })
      .expect(400);
    expect(hidden.body.error.details).toContain('contentTypeId is not a type businesses can pick');
  });

  it("lists only the business's own campaigns, newest first, and filters by status", async () => {
    await http().post('/v1/business/campaigns').set(as('other')).send({ ...draft(), title: 'Not yours' }).expect(201);

    const mine = await http().get('/v1/business/campaigns').set(as('kape')).expect(200);
    expect(mine.body.data.map((c: { title: string }) => c.title)).toEqual(['Ad videos', 'Boodle Feast Launch']);
    expect(mine.body.meta).toMatchObject({ total: 2, page: 1 });

    const live = await http().get('/v1/business/campaigns?status=LIVE').set(as('kape')).expect(200);
    expect(live.body.data).toEqual([]);
  });

  it('publishes a draft once', async () => {
    const list = await http().get('/v1/business/campaigns').set(as('kape')).expect(200);
    const id = list.body.data.find((c: { title: string }) => c.title === 'Boodle Feast Launch').id;

    const res = await http().post(`/v1/business/campaigns/${id}/publish`).set(as('kape')).expect(200);
    expect(res.body.data.status).toBe('LIVE');
    expect(res.body.data.publishedAt).toBeTruthy();

    const again = await http().post(`/v1/business/campaigns/${id}/publish`).set(as('kape')).expect(409);
    expect(again.body.error.code).toBe('CAMPAIGN_NOT_DRAFT');

    const del = await http().delete(`/v1/business/campaigns/${id}`).set(as('kape')).expect(409);
    expect(del.body.error.code).toBe('CAMPAIGN_NOT_DRAFT');
  });

  it("won't publish once applications have closed", async () => {
    const created = await http().post('/v1/business/campaigns').set(as('kape')).send({ ...draft(), title: 'Late' }).expect(201);
    await prisma.campaign.update({ where: { id: created.body.data.id }, data: { applyBy: new Date('2020-01-01T00:00:00Z') } });
    const res = await http().post(`/v1/business/campaigns/${created.body.data.id}/publish`).set(as('kape')).expect(409);
    expect(res.body.error.code).toBe('APPLY_DATE_PASSED');
  });

  it("keeps other businesses' campaigns hidden and lets the owner delete a draft", async () => {
    const other = await http().get('/v1/business/campaigns').set(as('other')).expect(200);
    const theirs = other.body.data[0].id;
    await http().get(`/v1/business/campaigns/${theirs}`).set(as('kape')).expect(404);
    await http().post(`/v1/business/campaigns/${theirs}/publish`).set(as('kape')).expect(404);
    await http().delete(`/v1/business/campaigns/${theirs}`).set(as('kape')).expect(404);

    await http().delete(`/v1/business/campaigns/${theirs}`).set(as('other')).expect(200);
    await http().get(`/v1/business/campaigns/${theirs}`).set(as('other')).expect(404);
  });

  it('lets admins see every campaign', async () => {
    await http().get('/v1/admin/campaigns').set(as('kape')).expect(403);
    await http().get('/v1/users/me').set(as('boss')).expect(200);
    await prisma.user.update({ where: { authId: idFor('boss') }, data: { role: 'ADMIN' } });
    const res = await http().get('/v1/admin/campaigns?status=LIVE').set(as('boss')).expect(200);
    expect(res.body.data.some((c: { title: string }) => c.title === 'Boodle Feast Launch')).toBe(true);
  });

  it('estimates views and counts matching creators in the business city', async () => {
    const res = await http()
      .post('/v1/business/campaigns/estimate')
      .set(as('kape'))
      .send({ platforms: ['TIKTOK'], deliverables: [{ format: 'VIDEO', count: 1 }], slots: 2, contentTypeId: sponsoredId })
      .expect(200);
    // Maya is in Testville on TikTok; Rio is on YouTube only; Far is in another city.
    expect(res.body.data).toMatchObject({ matchingCreators: 1, city: 'Testville', views: { low: 3000, high: 12000 } });

    const ugc = await http()
      .post('/v1/business/campaigns/estimate')
      .set(as('kape'))
      .send({ platforms: ['TIKTOK', 'YOUTUBE'], deliverables: [{ format: 'VIDEO', count: 2 }], slots: 1, contentTypeId: ugcId })
      .expect(200);
    expect(ugc.body.data).toMatchObject({ matchingCreators: 2, views: null });
  });

  it('saves a cover photo and replaces the old one', async () => {
    const created = await http().post('/v1/business/campaigns').set(as('kape')).send({ ...draft(), title: 'With cover' }).expect(201);
    const id = created.body.data.id;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    const first = await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('kape'))
      .attach('file', jpeg, { filename: 'cover.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(first.body.data.coverUrl).toMatch(new RegExp(`/campaigns/${id}/cover-\\d+\\.jpg$`));

    const second = await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('kape'))
      .attach('file', jpeg, { filename: 'cover.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(second.body.data.coverUrl).not.toBe(first.body.data.coverUrl);
    expect([...stored.keys()].filter((k) => k.startsWith(`campaigns/${id}/`))).toHaveLength(1);

    const text = await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('kape'))
      .attach('file', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(415);
    expect(text.body.error.code).toBe('UNSUPPORTED_FILE');
    await http().post(`/v1/business/campaigns/${id}/cover`).set(as('kape')).expect(400);
    await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('other'))
      .attach('file', jpeg, { filename: 'cover.jpg', contentType: 'image/jpeg' })
      .expect(404);

    // Deleting the draft removes its photo too.
    await http().delete(`/v1/business/campaigns/${id}`).set(as('kape')).expect(200);
    expect([...stored.keys()].filter((k) => k.startsWith(`campaigns/${id}/`))).toHaveLength(0);
  });

  it('saves optional performance targets and checks them', async () => {
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({
        ...draft(),
        title: 'With targets',
        goals: { impressions: { min: 10000, max: 50000 }, ctr: { min: 1.5 }, cpc: { max: 4.5 }, clicks: {} },
      })
      .expect(400);
    expect(res.body.error.details).toContain('goals.clicks needs a min or a max');

    const saved = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({ ...draft(), title: 'With targets', goals: { impressions: { min: 10000, max: 50000 }, ctr: { min: 1.5 }, cpc: { max: 4.5 } } })
      .expect(201);
    expect(saved.body.data.goals).toEqual({ impressions: { min: 10000, max: 50000 }, cpc: { max: 4.5 }, ctr: { min: 1.5 } });

    const bad = await http()
      .post('/v1/business/campaigns')
      .set(as('kape'))
      .send({ ...draft(), goals: { ctr: { min: 150 }, reach: { min: 5000, max: 100 }, conversions: { min: 2.5 } } })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const none = await http().post('/v1/business/campaigns').set(as('kape')).send({ ...draft(), title: 'No targets' }).expect(201);
    expect(none.body.data.goals).toBeNull();
  });

  it('edits a draft, with the same checks as creating', async () => {
    const created = await http().post('/v1/business/campaigns').set(as('kape')).send({ ...draft(), title: 'To edit' }).expect(201);
    const id = created.body.data.id;
    // The whole content type comes back, so the app can reopen the draft.
    expect(created.body.data.contentType).toMatchObject({ slug: 'sponsored-content', postsOnCreatorAccount: true, deliverables: expect.any(Array) });

    const edited = await http()
      .put(`/v1/business/campaigns/${id}`)
      .set(as('kape'))
      .send({ ...draft(), title: 'Edited', slots: 3, payment: 'COMMISSION', commissionPct: 12 })
      .expect(200);
    expect(edited.body.data).toMatchObject({ id, status: 'DRAFT', title: 'Edited', slots: 3, cashPerCreator: null, commissionPct: 12 });

    const bad = await http()
      .put(`/v1/business/campaigns/${id}`)
      .set(as('kape'))
      .send({ ...draft(), applyBy: day(-2) })
      .expect(400);
    expect(bad.body.error.details).toContain('applyBy can not be in the past');

    await http().put(`/v1/business/campaigns/${id}`).set(as('other')).send(draft()).expect(404);

    await http().post(`/v1/business/campaigns/${id}/publish`).set(as('kape')).expect(200);
    const live = await http().put(`/v1/business/campaigns/${id}`).set(as('kape')).send(draft()).expect(409);
    expect(live.body.error.code).toBe('CAMPAIGN_NOT_DRAFT');
    const liveCover = await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('kape'))
      .attach('file', Buffer.from([0xff, 0xd8]), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(409);
    expect(liveCover.body.error.code).toBe('CAMPAIGN_NOT_DRAFT');
  });

  it('removes a cover photo from a draft', async () => {
    const created = await http().post('/v1/business/campaigns').set(as('kape')).send({ ...draft(), title: 'Cover off' }).expect(201);
    const id = created.body.data.id;
    await http()
      .post(`/v1/business/campaigns/${id}/cover`)
      .set(as('kape'))
      .attach('file', Buffer.from([0xff, 0xd8]), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(200);
    const res = await http().delete(`/v1/business/campaigns/${id}/cover`).set(as('kape')).expect(200);
    expect(res.body.data.coverUrl).toBeNull();
    expect([...stored.keys()].filter((k) => k.startsWith(`campaigns/${id}/`))).toHaveLength(0);
  });
});
