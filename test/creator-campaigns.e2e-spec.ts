import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { AiClient, type AiJsonRequest } from '../src/integrations/openai/ai-client.js';
import { todayInManila } from '../src/modules/campaigns/campaign-rules.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test); only Supabase sign-in is faked.
// Other test files create live campaigns at the same time, so these checks
// look for specific campaigns instead of whole lists.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@discover.example.com` };
  },
};

/** Stands in for OpenAI: tests set what it answers and read what it was asked. */
const fakeAi = {
  enabled: true,
  asked: [] as AiJsonRequest[],
  answer: (_req: AiJsonRequest): unknown => ({ suggestions: [] }),
  json: async (req: AiJsonRequest) => {
    fakeAi.asked.push(req);
    return fakeAi.answer(req);
  },
};

const day = (n: number) => {
  const d = new Date(`${todayInManila()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Creator campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const made: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());
  const idsOf = (list: { id: string }[]) => list.map((c) => c.id);

  const signIn = (who: string) => http().get('/v1/users/me').set(as(who)).expect(200);

  const campaign = async (owner: string, title: string, opts: { slug?: string; platforms?: string[]; applyIn?: number; live?: boolean; visitTimes?: string[] }) => {
    const type = await prisma.contentType.findUniqueOrThrow({ where: { slug: opts.slug ?? 'sponsored-content' } });
    const applyIn = opts.applyIn ?? 3;
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as(owner))
      .send({
        contentTypeId: type.id,
        title,
        platforms: opts.platforms ?? ['TIKTOK'],
        deliverables: [{ format: 'VIDEO', count: 1, minSeconds: 30, maxSeconds: 60 }],
        hashtags: ['#KapeCebu'],
        tagBusiness: true,
        mentions: [],
        talkingPoints: ['Try the ube latte'],
        avoid: [],
        showLocation: true,
        reviewDrafts: true,
        revisions: 1,
        keepLiveDays: 30,
        payment: 'FIXED',
        cashPerCreator: 1500,
        slots: 2,
        applyBy: day(applyIn),
        contentDue: day(applyIn + 2),
        publishStart: day(applyIn + 3),
        publishEnd: day(applyIn + 10),
        spreadEvenly: false,
        visitTimes: opts.visitTimes ?? [],
      })
      .expect(201);
    if (opts.live !== false) await http().post(`/v1/business/campaigns/${res.body.data.id}/publish`).set(as(owner)).expect(200);
    return res.body.data.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .overrideProvider(AiClient)
      .useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { endsWith: '@discover.example.com' } } });

    const business = async (who: string, name: string, city: string, category: string) => {
      await signIn(who);
      await prisma.user.update({
        where: { authId: idFor(who) },
        data: { name, role: 'BUSINESS', onboardedAt: new Date(), businessProfile: { create: { city, category } } },
      });
    };
    await business('kape', 'Kape Testtown', 'Testtown', 'cafe');
    await business('isla', 'Isla Resort', 'Elsewhere', 'resort');
    await signIn('ella');
    await prisma.user.update({
      where: { authId: idFor('ella') },
      data: {
        name: 'Ella',
        role: 'CREATOR',
        onboardedAt: new Date(),
        creatorProfile: { create: { handle: 'ella_disc', city: 'Testtown', platforms: ['TIKTOK'], niches: ['food'] } },
      },
    });

    made.soon = await campaign('kape', 'Ube Latte Week', { slug: 'store-visit', visitTimes: ['Sat 12 PM', 'Sun 3 PM'] });
    made.later = await campaign('kape', 'Latte Art Month', { applyIn: 12 });
    made.youtube = await campaign('isla', 'Island Vlog', { platforms: ['YOUTUBE'] });
    made.resort = await campaign('isla', 'Resort TikTok', {});
    made.draft = await campaign('kape', 'Secret Draft', { live: false });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@discover.example.com' } } });
    await app.close();
  });

  it('is for creators only', async () => {
    await http().get('/v1/campaigns/discover').set(as('kape')).expect(403);
  });

  it('lists live campaigns the creator can join', async () => {
    const res = await http().get('/v1/campaigns/discover').set(as('ella')).expect(200);
    const d = res.body.data;
    expect(idsOf(d.featured)).toEqual(expect.arrayContaining([made.soon, made.later, made.resort]));
    expect(idsOf(d.featured)).not.toContain(made.youtube); // not on her platforms
    expect(idsOf(d.featured)).not.toContain(made.draft);
    expect(idsOf(d.endingSoon)).toContain(made.soon);
    expect(idsOf(d.endingSoon)).not.toContain(made.later); // 12 days away
    expect(idsOf(d.nearYou)).toEqual(expect.arrayContaining([made.soon, made.later]));
    expect(idsOf(d.nearYou)).not.toContain(made.resort); // another city

    const card = d.featured.find((c: { id: string }) => c.id === made.soon);
    expect(card).toMatchObject({
      title: 'Ube Latte Week',
      business: { name: 'Kape Testtown', city: 'Testtown', category: 'cafe' },
      cashPerCreator: 1500,
      slotsLeft: 2,
      daysLeft: 3,
    });
    const pick = d.forYou.find((x: { campaign: { id: string } }) => x.campaign.id === made.soon);
    expect(pick.reasons).toEqual(['In Testtown', 'Fits your food content', 'You post on TikTok']);
    expect(d.city).toBe('Testtown');
    expect(d.categories.map((c: { id: string }) => c.id)).toContain('cafe');
  });

  it('filters by business category and search', async () => {
    const resort = await http().get('/v1/campaigns/discover?category=resort').set(as('ella')).expect(200);
    expect(idsOf(resort.body.data.featured)).toEqual([made.resort]);
    const search = await http().get('/v1/campaigns/discover?q=latte%20art').set(as('ella')).expect(200);
    expect(idsOf(search.body.data.featured)).toEqual([made.later]);
    await http().get('/v1/campaigns/discover?category=bakery').set(as('ella')).expect(400);
  });

  it('gives businesses AI ideas, cleaned, and says when AI is off', async () => {
    fakeAi.answer = () => ({ suggestions: ['Ube Latte', '#KapeCebu', '#CebuEats'] });
    const res = await http()
      .post('/v1/business/campaigns/suggest')
      .set(as('kape'))
      .send({ field: 'hashtags', brief: 'ube latte', existing: ['#KapeCebu'] })
      .expect(200);
    expect(res.body.data.suggestions).toEqual(['#UbeLatte', '#CebuEats']);
    const prompt = fakeAi.asked.at(-1)!.user;
    expect(prompt).toContain('Kape Testtown (Café) in Testtown');
    expect(prompt).toContain('ube latte');

    await http().post('/v1/business/campaigns/suggest').set(as('ella')).send({ field: 'title' }).expect(403);
    await http().post('/v1/business/campaigns/suggest').set(as('kape')).send({ field: 'jokes' }).expect(400);
    fakeAi.enabled = false;
    const off = await http().post('/v1/business/campaigns/suggest').set(as('kape')).send({ field: 'title' }).expect(503);
    expect(off.body.error.code).toBe('AI_NOT_CONFIGURED');
    fakeAi.enabled = true;
  });

  it('ranks Quick match with AI and a personal reason, or by the rule when AI is off', async () => {
    fakeAi.answer = (req) => {
      const ids = (JSON.parse(req.user.split('\n')[2]) as { id: string; title: string }[]).map((c) => c.id);
      return { picks: ids.map((id) => ({ id, score: id === made.resort ? 90 : 20, reason: id === made.resort ? 'Your TikToks would suit this resort.' : 'Okay fit.' })) };
    };
    const ai = (await http().get('/v1/campaigns/for-you').set(as('ella')).expect(200)).body.data;
    expect(ai.source).toBe('AI');
    expect(ai.picks[0]).toMatchObject({ campaign: { id: made.resort }, score: 90, aiReason: 'Your TikToks would suit this resort.' });
    // The model only saw campaign facts, not the creator's name or handle.
    expect(fakeAi.asked.at(-1)!.user).not.toContain('ella');

    fakeAi.enabled = false;
    const rule = (await http().get('/v1/campaigns/for-you').set(as('ella')).expect(200)).body.data;
    expect(rule.source).toBe('RULE');
    expect(rule.picks[0].aiReason).toBeNull();
    fakeAi.enabled = true;
  });

  it('shows one campaign with what to include, and lets her ask to join with a visit time', async () => {
    const page = await http().get(`/v1/campaigns/${made.soon}`).set(as('ella')).expect(200);
    expect(page.body.data).toMatchObject({
      cantApply: null,
      hashtags: ['#KapeCebu'],
      talkingPoints: ['Try the ube latte'],
      visitTimes: ['Sat 12 PM', 'Sun 3 PM'],
      myApplication: null,
      contentType: { slug: 'store-visit', requiresVisit: true },
    });
    await http().get(`/v1/campaigns/${made.draft}`).set(as('ella')).expect(404);
    expect((await http().get(`/v1/campaigns/${made.youtube}`).set(as('ella')).expect(200)).body.data.cantApply).toBe('NOT_ON_PLATFORM');

    await http().post(`/v1/campaigns/${made.soon}/applications`).set(as('ella')).send({ note: 'Hi!' }).expect(400);
    await http().post(`/v1/campaigns/${made.soon}/applications`).set(as('ella')).send({ visitTime: 'Mon 9 AM' }).expect(400);
    const applied = await http()
      .post(`/v1/campaigns/${made.soon}/applications`)
      .set(as('ella'))
      .send({ note: 'Hi!', visitTime: 'Sun 3 PM' })
      .expect(201);
    expect(applied.body.data).toMatchObject({ status: 'PENDING', visitTime: 'Sun 3 PM' });

    const after = await http().get(`/v1/campaigns/${made.soon}`).set(as('ella')).expect(200);
    expect(after.body.data).toMatchObject({ cantApply: 'APPLIED', myApplication: { status: 'PENDING', visitTime: 'Sun 3 PM' } });
    const d = (await http().get('/v1/campaigns/discover').set(as('ella')).expect(200)).body.data;
    expect(idsOf(d.featured)).not.toContain(made.soon);
    expect(d.stats).toMatchObject({ applied: 1, ongoing: 0 });
  });

  it('counts ongoing, pending and earned money for the creator', async () => {
    const list = await http().get(`/v1/business/campaigns/${made.soon}/applications`).set(as('kape')).expect(200);
    const appId = list.body.data.applications[0].id;
    expect(list.body.data.applications[0].visitTime).toBe('Sun 3 PM');
    await http().post(`/v1/business/campaigns/${made.soon}/applications/${appId}/approve`).set(as('kape')).expect(200);

    let stats = (await http().get('/v1/campaigns/discover').set(as('ella')).expect(200)).body.data.stats;
    expect(stats).toMatchObject({ applied: 0, ongoing: 1, pendingAmount: 1500, earnedThisMonth: 0 });

    await prisma.creatorDeliverable.updateMany({ where: { applicationId: appId }, data: { status: 'APPROVED' } });
    await http().post(`/v1/business/campaigns/${made.soon}/applications/${appId}/paid`).set(as('kape')).expect(200);
    stats = (await http().get('/v1/campaigns/discover').set(as('ella')).expect(200)).body.data.stats;
    expect(stats).toMatchObject({ ongoing: 0, pendingAmount: 0, earnedThisMonth: 1500 });
  });

  it("puts requests, campaigns I'm in and finished ones in Collabs", async () => {
    const collabs = async () => (await http().get('/v1/creator/collabs').set(as('ella')).expect(200)).body.data;
    const ids = (list: { campaign: { id: string } }[]) => list.map((x) => x.campaign.id);

    // The paid campaign from the last test is done.
    let c = await collabs();
    expect(ids(c.done)).toContain(made.soon);
    expect(c.summary).toMatchObject({ earned: 1500, campaignsDone: 1 });

    await http().post(`/v1/campaigns/${made.later}/applications`).set(as('ella')).send({ note: 'Me!' }).expect(201);
    c = await collabs();
    expect(c.pending.find((x: { campaign: { id: string } }) => x.campaign.id === made.later)).toMatchObject({ status: 'PENDING', note: 'Me!' });

    await http().delete(`/v1/campaigns/${made.later}/applications`).set(as('ella')).expect(200);
    expect(ids((await collabs()).pending)).not.toContain(made.later);
    await http().delete(`/v1/campaigns/${made.later}/applications`).set(as('ella')).expect(404);

    await http().post(`/v1/campaigns/${made.later}/applications`).set(as('ella')).send({}).expect(201);
    const list = await http().get(`/v1/business/campaigns/${made.later}/applications`).set(as('kape')).expect(200);
    await http()
      .post(`/v1/business/campaigns/${made.later}/applications/${list.body.data.applications[0].id}/approve`)
      .set(as('kape'))
      .expect(200);
    const late = await http().delete(`/v1/campaigns/${made.later}/applications`).set(as('ella')).expect(409);
    expect(late.body.error.code).toBe('APPLICATION_ALREADY_DECIDED');

    c = await collabs();
    const mine = c.ongoing.find((x: { campaign: { id: string } }) => x.campaign.id === made.later);
    expect(mine).toMatchObject({ done: 0, total: 1, late: false });
    expect(c.summary.onTheWay).toBe(1500);

    await http()
      .post(`/v1/creator/deliverables/${mine.pieces[0].id}/submit`)
      .set(as('ella'))
      .send({ contentUrl: 'https://www.tiktok.com/@ella/video/9', caption: 'Latte art!' })
      .expect(200);
    const after = (await collabs()).ongoing.find((x: { campaign: { id: string } }) => x.campaign.id === made.later);
    expect(after.pieces[0]).toMatchObject({ status: 'SUBMITTED', contentUrl: 'https://www.tiktok.com/@ella/video/9' });
  });
});
