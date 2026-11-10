import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
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
    return { sub: idFor(name), email: `${name}@apps.example.com` };
  },
};

const day = (n: number) => {
  const d = new Date(`${todayInManila()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Campaign applications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let campaignId: string;
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());
  const appIdOf = async (who: string) =>
    (await prisma.campaignApplication.findFirstOrThrow({ where: { campaignId, creator: { authId: idFor(who) } } })).id;

  const signIn = async (who: string) => {
    await http().get('/v1/users/me').set(as(who)).expect(200);
  };
  const makeCreator = async (who: string, platforms: ('TIKTOK' | 'YOUTUBE')[]) => {
    await signIn(who);
    await prisma.user.update({
      where: { authId: idFor(who) },
      data: { name: who, role: 'CREATOR', onboardedAt: new Date(), creatorProfile: { create: { handle: `${who}_apps`, city: 'Cebu City', platforms } } },
    });
  };

  const newCampaign = async (title: string) => {
    const typeId = (await prisma.contentType.findUniqueOrThrow({ where: { slug: 'sponsored-content' } })).id;
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('shop'))
      .send({
        contentTypeId: typeId,
        title,
        platforms: ['TIKTOK'],
        deliverables: [{ format: 'VIDEO', count: 1, minSeconds: 30, maxSeconds: 60 }],
        hashtags: [],
        tagBusiness: true,
        mentions: [],
        talkingPoints: [],
        avoid: [],
        showLocation: false,
        reviewDrafts: false,
        revisions: 0,
        keepLiveDays: 30,
        payment: 'FIXED',
        cashPerCreator: 2000,
        slots: 2,
        applyBy: day(3),
        contentDue: day(6),
        publishStart: day(7),
        publishEnd: day(20),
        spreadEvenly: false,
        visitTimes: [],
      })
      .expect(201);
    return res.body.data.id as string;
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
    await prisma.user.deleteMany({ where: { email: { endsWith: '@apps.example.com' } } });

    for (const who of ['shop', 'rival']) {
      await signIn(who);
      await prisma.user.update({
        where: { authId: idFor(who) },
        data: { role: 'BUSINESS', onboardedAt: new Date(), businessProfile: { create: { city: 'Cebu City', category: 'cafe' } } },
      });
    }
    for (const who of ['ana', 'ben', 'dee', 'eve']) await makeCreator(who, ['TIKTOK']);
    await makeCreator('cy', ['YOUTUBE']);
    campaignId = await newCampaign('Apply here');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@apps.example.com' } } });
    await app.close();
  });

  it('hides drafts from creators', async () => {
    await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('ana')).send({}).expect(404);
    await http().post(`/v1/business/campaigns/${campaignId}/publish`).set(as('shop')).expect(200);
  });

  it('lets creators on the right platform apply once', async () => {
    const res = await http()
      .post(`/v1/campaigns/${campaignId}/applications`)
      .set(as('ana'))
      .send({ note: 'I love your cakes!' })
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', note: 'I love your cakes!', creator: { handle: 'ana_apps' } });

    const again = await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('ana')).send({}).expect(409);
    expect(again.body.error.code).toBe('ALREADY_APPLIED');

    const wrong = await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('cy')).send({}).expect(403);
    expect(wrong.body.error.code).toBe('NOT_ON_PLATFORM');

    await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('shop')).send({}).expect(403);
    await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('ben')).send({}).expect(201);
    await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('dee')).send({}).expect(201);
  });

  it('shows the business who applied, and counts waiting creators on the campaign', async () => {
    const res = await http().get(`/v1/business/campaigns/${campaignId}/applications`).set(as('shop')).expect(200);
    expect(res.body.data).toMatchObject({ slots: 2, approved: 0, pending: 3 });
    expect(res.body.data.applications.map((a: { creator: { name: string } }) => a.creator.name)).toEqual(['ana', 'ben', 'dee']);

    const campaign = await http().get(`/v1/business/campaigns/${campaignId}`).set(as('shop')).expect(200);
    expect(campaign.body.data.pendingApplications).toBe(3);

    await http().get(`/v1/business/campaigns/${campaignId}/applications`).set(as('rival')).expect(404);
    await http().get(`/v1/business/campaigns/${campaignId}/applications`).set(as('ana')).expect(403);
  });

  it('approves up to the number of slots and declines the rest', async () => {
    await http().post(`/v1/business/campaigns/${campaignId}/applications/${await appIdOf('ana')}/approve`).set(as('shop')).expect(200);
    const two = await http()
      .post(`/v1/business/campaigns/${campaignId}/applications/${await appIdOf('ben')}/approve`)
      .set(as('shop'))
      .expect(200);
    expect(two.body.data).toMatchObject({ approved: 2, pending: 1 });

    const full = await http()
      .post(`/v1/business/campaigns/${campaignId}/applications/${await appIdOf('dee')}/approve`)
      .set(as('shop'))
      .expect(409);
    expect(full.body.error.code).toBe('SLOTS_FULL');

    const declined = await http()
      .post(`/v1/business/campaigns/${campaignId}/applications/${await appIdOf('dee')}/decline`)
      .set(as('shop'))
      .expect(200);
    // Waiting first, then approved, then declined.
    expect(declined.body.data.applications.map((a: { status: string }) => a.status)).toEqual(['APPROVED', 'APPROVED', 'DECLINED']);

    const again = await http()
      .post(`/v1/business/campaigns/${campaignId}/applications/${await appIdOf('ana')}/decline`)
      .set(as('shop'))
      .expect(409);
    expect(again.body.error.code).toBe('APPLICATION_ALREADY_DECIDED');

    const late = await http().post(`/v1/campaigns/${campaignId}/applications`).set(as('eve')).send({}).expect(409);
    expect(late.body.error.code).toBe('CAMPAIGN_FULL');
  });

  it('only decides on live campaigns, and only for the owner', async () => {
    const draftId = await newCampaign('Still a draft');
    const eve = await prisma.user.findUniqueOrThrow({ where: { authId: idFor('eve') } });
    const application = await prisma.campaignApplication.create({ data: { campaignId: draftId, creatorId: eve.id } });

    const res = await http()
      .post(`/v1/business/campaigns/${draftId}/applications/${application.id}/approve`)
      .set(as('shop'))
      .expect(409);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_LIVE');

    await http()
      .post(`/v1/business/campaigns/${draftId}/applications/${application.id}/approve`)
      .set(as('rival'))
      .expect(404);
  });

  describe('after approval (Ongoing)', () => {
    type Piece = { id: string; status: string; late: boolean; changesLeft: number };
    type Row = { creator: { name: string }; applicationId: string; canMarkPaid: boolean; paidAt: string | null; pieces: Piece[] };
    const ongoing = async () => {
      const res = await http().get('/v1/business/campaigns/ongoing').set(as('shop')).expect(200);
      return res.body.data.find((c: { id: string }) => c.id === campaignId);
    };
    const rowOf = async (name: string): Promise<Row> => (await ongoing()).creators.find((r: Row) => r.creator.name === name);

    it('gives each approved creator a checklist', async () => {
      const c = await ongoing();
      expect(c.summary).toMatchObject({ creators: 2, pieces: 2, approved: 0, needsReview: 0, late: 0, cashTotal: 4000, cashPaid: 0 });
      expect(c.creators.map((r: Row) => r.creator.name)).toEqual(['ana', 'ben']);
      expect((await rowOf('ana')).pieces[0]).toMatchObject({ status: 'TODO', changesLeft: 1 });
      const rival = await http().get('/v1/business/campaigns/ongoing').set(as('rival')).expect(200);
      expect(rival.body.data).toEqual([]);
    });

    it('lets the creator send content and the business ask for changes once', async () => {
      const piece = (await rowOf('ana')).pieces[0].id;
      await http()
        .post(`/v1/creator/deliverables/${piece}/submit`)
        .set(as('ana'))
        .send({ contentUrl: 'http://not-secure.example.com' })
        .expect(400);
      await http().post(`/v1/creator/deliverables/${piece}/submit`).set(as('ben')).send({ contentUrl: 'https://x.com/1' }).expect(404);
      await http()
        .post(`/v1/creator/deliverables/${piece}/submit`)
        .set(as('ana'))
        .send({ contentUrl: 'https://www.tiktok.com/@ana/video/1', caption: 'So good!' })
        .expect(200);
      const again = await http().post(`/v1/creator/deliverables/${piece}/submit`).set(as('ana')).send({ contentUrl: 'https://x.com/2' }).expect(409);
      expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
      expect((await ongoing()).summary.needsReview).toBe(1);

      await http().post(`/v1/business/deliverables/${piece}/request-changes`).set(as('rival')).send({ feedback: 'x' }).expect(404);
      await http()
        .post(`/v1/business/deliverables/${piece}/request-changes`)
        .set(as('shop'))
        .send({ feedback: 'Please add our tag.' })
        .expect(200);
      expect((await rowOf('ana')).pieces[0]).toMatchObject({ status: 'CHANGES_REQUESTED', changesLeft: 0 });

      await http()
        .post(`/v1/creator/deliverables/${piece}/submit`)
        .set(as('ana'))
        .send({ contentUrl: 'https://files.test/enhanced.jpg', originalUrl: 'https://files.test/original.jpg' })
        .expect(200);
      expect((await rowOf('ana')).pieces[0]).toMatchObject({ aiEnhanced: true, originalUrl: 'https://files.test/original.jpg' });
      const limit = await http()
        .post(`/v1/business/deliverables/${piece}/request-changes`)
        .set(as('shop'))
        .send({ feedback: 'One more thing.' })
        .expect(409);
      expect(limit.body.error.code).toBe('CHANGES_LIMIT_REACHED');
    });

    it('approves content, then the business marks the creator paid', async () => {
      const ana = await rowOf('ana');
      await http().post(`/v1/business/deliverables/${ana.pieces[0].id}/approve`).set(as('shop')).expect(200);
      const notWaiting = await http().post(`/v1/business/deliverables/${ana.pieces[0].id}/approve`).set(as('shop')).expect(409);
      expect(notWaiting.body.error.code).toBe('NOT_WAITING_FOR_REVIEW');
      expect((await rowOf('ana')).canMarkPaid).toBe(true);

      const ben = await rowOf('ben');
      const early = await http().post(`/v1/business/campaigns/${campaignId}/applications/${ben.applicationId}/paid`).set(as('shop')).expect(409);
      expect(early.body.error.code).toBe('NOT_ALL_APPROVED');

      await http().post(`/v1/business/campaigns/${campaignId}/applications/${ana.applicationId}/paid`).set(as('shop')).expect(200);
      const twice = await http().post(`/v1/business/campaigns/${campaignId}/applications/${ana.applicationId}/paid`).set(as('shop')).expect(409);
      expect(twice.body.error.code).toBe('ALREADY_PAID');
      const c = await ongoing();
      expect(c.summary).toMatchObject({ approved: 1, cashPaid: 2000 });
      expect(c.creators[0].paidAt).toBeTruthy();
    });

    it('flags content that is late', async () => {
      await prisma.campaign.update({ where: { id: campaignId }, data: { contentDue: new Date('2020-01-01T00:00:00Z') } });
      const c = await ongoing();
      expect(c.summary.late).toBe(1);
      expect((await rowOf('ben')).pieces[0].late).toBe(true);
    });
  });
});
