import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenVerifier } from '../src/auth/token-verifier.service.js';
import { MotionStudio, type MotionRequest } from '../src/integrations/media/motion/motion-studio.js';
import { VideoTools } from '../src/integrations/media/video-tools.js';
import { AiClient, type AiImageEditRequest, type AiJsonRequest, type AiVideoRequest } from '../src/integrations/openai/ai-client.js';
import { FileStorage } from '../src/integrations/supabase/file-storage.js';
import { todayInManila } from '../src/modules/campaigns/campaign-rules.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Real app + local test database (.env.test). Sign-in, storage and the AI are fakes:
// tests never call Supabase or OpenAI.
const ids = new Map<string, string>();
const idFor = (name: string) => {
  if (!ids.has(name)) ids.set(name, randomUUID());
  return ids.get(name)!;
};
const fakeVerifier = {
  verify: async (token: string) => {
    if (!token.startsWith('test|')) throw new Error('bad token');
    const name = token.slice(5);
    return { sub: idFor(name), email: `${name}@studio.example.com` };
  },
};

const BASE = 'https://files.test/object/public/campaign-media/';
const fakeStorage: FileStorage = {
  upload: async (path) => `${BASE}${path}`,
  removeByUrl: async () => undefined,
  isOurs: (url) => url.startsWith(BASE),
  download: async () => Buffer.from('photo'),
};

const fakeAi = {
  enabled: true,
  asked: [] as AiJsonRequest[],
  edits: [] as AiImageEditRequest[],
  json: async (req: AiJsonRequest) => {
    fakeAi.asked.push(req);
    if (req.name === 'caption') return { caption: 'Ube latte heaven' };
    return {
      hooks: [{ style: 'POV', text: 'POV: the ube latte you keep thinking about' }],
      shots: [{ time: '0 to 3s', text: 'Pour shot' }],
      script: 'Line one\nLine two',
      caption: 'Come try the ube latte',
    };
  },
  editImage: async (req: AiImageEditRequest) => {
    fakeAi.edits.push(req);
    return [Buffer.from('a'), Buffer.from('b')];
  },
  videos: [] as AiVideoRequest[],
  transcribeSrt: async () => '1\n00:00:00,000 --> 00:00:01,000\nHello Cebu\n',
  generateVideo: async (req: AiVideoRequest) => {
    fakeAi.videos.push(req);
    return Buffer.from('clip');
  },
};

/** Stands in for ffmpeg. */
const fakeVideo = {
  seconds: 30,
  polished: [] as { path: string; opts: { fit: string; look: string; srt?: string } }[],
  durationSeconds: async () => fakeVideo.seconds,
  extractAudio: async () => Buffer.from('audio'),
  polish: async (path: string, opts: { fit: string; look: string; srt?: string }) => {
    fakeVideo.polished.push({ path, opts });
    return Buffer.from('mp4');
  },
  frameForClip: async (image: Buffer) => image,
};

/** Stands in for the motion templates (canvas + ffmpeg). */
const fakeMotion = {
  requests: [] as MotionRequest[],
  prepare: async (req: MotionRequest) => {
    fakeMotion.requests.push(req);
    return req as never;
  },
  storyboard: async () => Buffer.from('board'),
  video: async (_p: unknown, template: string) => Buffer.from(template),
};

/** Waits for a background job to finish (they run right after the request returns). */
const waitForJob = async (get: () => Promise<{ status: string }>) => {
  for (let i = 0; i < 50; i++) {
    const job = await get();
    if (job.status === 'DONE' || job.status === 'FAILED') return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
};

const day = (n: number) => {
  const d = new Date(`${todayInManila()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Studio and Enhance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const pieces: Record<string, string> = {};
  let draftId = '';
  const as = (who: string) => ({ Authorization: `Bearer test|${who}` });
  const http = () => request(app.getHttpServer());
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  const campaign = async (slug: string, title: string, live = true) => {
    const type = await prisma.contentType.findUniqueOrThrow({ where: { slug } });
    const posts = type.postsOnCreatorAccount;
    const res = await http()
      .post('/v1/business/campaigns')
      .set(as('shop'))
      .send({
        contentTypeId: type.id,
        title,
        platforms: ['TIKTOK'],
        deliverables: [{ format: 'PHOTO', count: 1 }],
        hashtags: ['#KapeCebu'],
        tagBusiness: true,
        mentions: ['@chefjuan'],
        talkingPoints: ['Try the ube latte'],
        avoid: ['Other cafes'],
        link: 'KAPE10',
        showLocation: false,
        reviewDrafts: false,
        revisions: 0,
        ...(posts && { keepLiveDays: 30, publishStart: day(4), publishEnd: day(10) }),
        payment: 'FIXED',
        cashPerCreator: 1000,
        slots: 2,
        applyBy: day(2),
        contentDue: day(3),
        spreadEvenly: false,
        visitTimes: type.requiresVisit ? ['Sat 12 PM'] : [],
      })
      .expect(201);
    const id = res.body.data.id as string;
    if (!live) return id;
    await http().post(`/v1/business/campaigns/${id}/publish`).set(as('shop')).expect(200);
    await http()
      .post(`/v1/campaigns/${id}/applications`)
      .set(as('mia'))
      .send(type.requiresVisit ? { visitTime: 'Sat 12 PM' } : {})
      .expect(201);
    const list = await http().get(`/v1/business/campaigns/${id}/applications`).set(as('shop')).expect(200);
    await http().post(`/v1/business/campaigns/${id}/applications/${list.body.data.applications[0].id}/approve`).set(as('shop')).expect(200);
    const piece = await prisma.creatorDeliverable.findFirstOrThrow({ where: { campaignId: id } });
    return piece.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(fakeVerifier)
      .overrideProvider(FileStorage)
      .useValue(fakeStorage)
      .overrideProvider(AiClient)
      .useValue(fakeAi)
      .overrideProvider(VideoTools)
      .useValue(fakeVideo)
      .overrideProvider(MotionStudio)
      .useValue(fakeMotion)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { endsWith: '@studio.example.com' } } });

    await http().get('/v1/users/me').set(as('shop')).expect(200);
    await prisma.user.update({
      where: { authId: idFor('shop') },
      data: { name: 'Kape Studio', role: 'BUSINESS', onboardedAt: new Date(), businessProfile: { create: { city: 'Cebu City', category: 'cafe' } } },
    });
    for (const who of ['mia', 'zed']) {
      await http().get('/v1/users/me').set(as(who)).expect(200);
      await prisma.user.update({
        where: { authId: idFor(who) },
        data: { name: who, role: 'CREATOR', onboardedAt: new Date(), creatorProfile: { create: { handle: `${who}_studio`, platforms: ['TIKTOK'], niches: ['food'] } } },
      });
    }
    pieces.ugc = await campaign('ugc', 'Ube ad photos');
    pieces.visit = await campaign('store-visit', 'Ube visit');
    draftId = await campaign('sponsored-content', 'Cover test', false);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@studio.example.com' } } });
    await app.close();
  });

  it('allows full styles for ad-style campaigns and businesses, light fixes otherwise', async () => {
    const ugc = (await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.ugc}`).set(as('mia')).expect(200)).body.data;
    expect(ugc.level).toBe('full');
    expect(ugc.styles.length).toBeGreaterThan(1);
    const visit = (await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.visit}`).set(as('mia')).expect(200)).body.data;
    expect(visit).toMatchObject({ level: 'light', styles: [{ id: 'light-fix' }] });
    expect((await http().get('/v1/ai/enhance/styles').set(as('shop')).expect(200)).body.data.level).toBe('full');
    await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.ugc}`).set(as('zed')).expect(404);
  });

  it('enhances a creator photo, keeps the original, and refuses full styles on a visit', async () => {
    const bad = await http()
      .post('/v1/ai/enhance')
      .set(as('mia'))
      .field('style', 'studio-splash')
      .field('pieceId', pieces.visit)
      .attach('file', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(bad.body.error.code).toBe('STYLE_NOT_ALLOWED');

    const res = await http()
      .post('/v1/ai/enhance')
      .set(as('mia'))
      .field('style', 'studio-splash')
      .field('pieceId', pieces.ugc)
      .attach('file', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(res.body.data).toMatchObject({ level: 'full', style: 'studio-splash', label: 'AI-enhanced' });
    expect(res.body.data.images).toHaveLength(2);
    expect(res.body.data.originalUrl).toContain('-original.jpg');
    const edit = fakeAi.edits.at(-1)!;
    expect(edit).toMatchObject({ n: 2, size: '1024x1536' });
    expect(edit.prompt).toContain('Keep the main product or dish exactly as it is');
    expect(edit.userId).not.toContain('mia');
  });

  it('lets a business enhance a cover and use it, but only its own enhanced photo', async () => {
    const res = await http()
      .post('/v1/ai/enhance')
      .set(as('shop'))
      .field('style', 'clean-white')
      .field('purpose', 'cover')
      .attach('file', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(fakeAi.edits.at(-1)!.size).toBe('1536x1024');
    const url = res.body.data.images[0];

    const set = await http().put(`/v1/business/campaigns/${draftId}/cover`).set(as('shop')).send({ url }).expect(200);
    expect(set.body.data.coverUrl).toBe(url);
    await http()
      .put(`/v1/business/campaigns/${draftId}/cover`)
      .set(as('shop'))
      .send({ url: 'https://evil.example.com/x.jpg' })
      .expect(400);
  });

  // A posting campaign (store visit): UGC campaigns keep no hashtags or mentions, since creators don't post them.
  it('plans a piece from the real campaign and adds the must-haves to the caption', async () => {
    const res = await http().post('/v1/creator/studio/plan').set(as('mia')).send({ pieceId: pieces.visit, tone: 'Bisaya' }).expect(200);
    const plan = res.body.data;
    expect(plan.hooks[0].text).toContain('ube latte');
    expect(plan.caption).toContain('#KapeCebu');
    expect(plan.caption).toContain('@chefjuan');
    expect(plan.caption).toContain('KAPE10');
    expect(plan.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(plan.tagBusiness).toBe('Kape Studio');
    const prompt = fakeAi.asked.at(-1)!.user;
    expect(prompt).toContain('Try the ube latte');
    expect(prompt).toContain('Bisaya');
    expect(prompt).not.toContain('mia');

    const caption = await http().post('/v1/creator/studio/caption').set(as('mia')).send({ pieceId: pieces.visit, current: 'old one' }).expect(200);
    expect(caption.body.data.caption).toContain('Ube latte heaven');
    expect(caption.body.data.caption).toContain('#KapeCebu');

    const checks = await http().post('/v1/creator/studio/check-caption').set(as('mia')).send({ pieceId: pieces.visit, caption: 'nothing' }).expect(200);
    expect(checks.body.data.checks.filter((c: { ok: boolean }) => !c.ok)).toHaveLength(3);

    await http().post('/v1/creator/studio/plan').set(as('zed')).send({ pieceId: pieces.ugc }).expect(404);
    fakeAi.enabled = false;
    const off = await http().post('/v1/creator/studio/plan').set(as('mia')).send({ pieceId: pieces.ugc }).expect(503);
    expect(off.body.error.code).toBe('AI_NOT_CONFIGURED');
    fakeAi.enabled = true;
  });

  it("saves a creator's own photo for a piece", async () => {
    const res = await http()
      .post(`/v1/creator/studio/pieces/${pieces.ugc}/photo`)
      .set(as('mia'))
      .attach('file', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(res.body.data.url).toContain(`/pieces/${pieces.ugc}/`);
    await http()
      .post(`/v1/creator/studio/pieces/${pieces.ugc}/photo`)
      .set(as('zed'))
      .attach('file', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(404);
  });

  it('polishes my own video in the background: 9:16, look and subtitles', async () => {
    const styles = (await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.ugc}`).set(as('mia')).expect(200)).body.data;
    expect(styles.animate.allowed).toBe(true);
    expect((await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.visit}`).set(as('mia')).expect(200)).body.data.animate.allowed).toBe(false);

    const res = await http()
      .post('/v1/creator/studio/videos/polish')
      .set(as('mia'))
      .field('pieceId', pieces.ugc)
      .field('look', 'bright')
      .field('fit', 'blur')
      .field('subtitles', 'true')
      .attach('file', Buffer.from('fake video'), { filename: 'v.mp4', contentType: 'video/mp4' })
      .expect(200);
    expect(res.body.data).toMatchObject({ kind: 'POLISH', label: null });
    const job = (await waitForJob(async () => (await http().get(`/v1/creator/studio/jobs/${res.body.data.id}`).set(as('mia'))).body.data)) as {
      status: string;
      outputUrl: string;
    };
    expect(job.status).toBe('DONE');
    expect(job.outputUrl).toMatch(/\/videos\/.+\.mp4$/);
    const last = fakeVideo.polished.at(-1)!;
    expect(last.opts).toMatchObject({ fit: 'blur', look: 'bright' });
    expect(last.opts.srt).toContain('Hello Cebu');
    // The upload is deleted from the API's disk once done.
    expect(existsSync(last.path)).toBe(false);
    await http().get(`/v1/creator/studio/jobs/${res.body.data.id}`).set(as('zed')).expect(404);

    fakeVideo.seconds = 500;
    const long = await http()
      .post('/v1/creator/studio/videos/polish')
      .set(as('mia'))
      .field('pieceId', pieces.ugc)
      .attach('file', Buffer.from('fake video'), { filename: 'v.mp4', contentType: 'video/mp4' })
      .expect(400);
    expect(long.body.error.code).toBe('VIDEO_TOO_LONG');
    fakeVideo.seconds = 30;
    await http()
      .post('/v1/creator/studio/videos/polish')
      .set(as('mia'))
      .field('pieceId', pieces.ugc)
      .attach('file', Buffer.from('text'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(415);
  });

  it('makes an AI clip from my own photo, only for ad-style campaigns, labelled AI-generated', async () => {
    const mia = await prisma.user.findUniqueOrThrow({ where: { authId: idFor('mia') } });
    const myPhoto = `${BASE}enhance/${mia.id}/1-studio-splash-1.jpg`;

    const visit = await http()
      .post('/v1/creator/studio/videos/animate')
      .set(as('mia'))
      .send({ pieceId: pieces.visit, imageUrl: myPhoto, motion: 'splash' })
      .expect(403);
    expect(visit.body.error.code).toBe('ANIMATE_NOT_ALLOWED');
    await http()
      .post('/v1/creator/studio/videos/animate')
      .set(as('mia'))
      .send({ pieceId: pieces.ugc, imageUrl: 'https://evil.example.com/x.jpg', motion: 'splash' })
      .expect(400);

    const res = await http()
      .post('/v1/creator/studio/videos/animate')
      .set(as('mia'))
      .send({ pieceId: pieces.ugc, imageUrl: myPhoto, motion: 'orbit', seconds: '8' })
      .expect(200);
    expect(res.body.data).toMatchObject({ kind: 'ANIMATE', label: 'AI-generated', inputUrl: myPhoto });
    const job = (await waitForJob(async () => (await http().get(`/v1/creator/studio/jobs/${res.body.data.id}`).set(as('mia'))).body.data)) as {
      status: string;
      outputUrl: string;
    };
    expect(job.status).toBe('DONE');
    expect(job.outputUrl).toContain('-ai.mp4');
    const ask = fakeAi.videos.at(-1)!;
    expect(ask.seconds).toBe('8');
    expect(ask.prompt).toContain('Keep the product exactly as it is in every frame');
  });

  it('makes 3 moving ad variations from my photo with the campaign words, for any campaign type', async () => {
    const mia = await prisma.user.findUniqueOrThrow({ where: { authId: idFor('mia') } });
    const myPhoto = `${BASE}pieces/${pieces.visit}/photo.jpg`;

    // Suggested words and end card choices come from the campaign, not AI.
    const styles = (await http().get(`/v1/ai/enhance/styles?pieceId=${pieces.visit}`).set(as('mia')).expect(200)).body.data;
    expect(styles.motion).toMatchObject({ allowed: true, words: ['Ube', 'visit'], ctaOptions: ['KAPE10', '#KapeCebu'], businessName: 'Kape Studio' });
    expect(styles.motion.variants.map((v: { key: string }) => v.key)).toEqual(['A', 'B', 'C']);

    const bad = await http()
      .post('/v1/creator/studio/videos/motion')
      .set(as('mia'))
      .send({ pieceId: pieces.visit, imageUrl: myPhoto, words: ['Ube'], cta: '50% OFF TODAY' })
      .expect(400);
    expect(bad.body.error.details[0]).toContain('cta');
    await http().post('/v1/creator/studio/videos/motion').set(as('zed')).send({ pieceId: pieces.visit, imageUrl: myPhoto, words: ['Ube'] }).expect(404);

    const res = await http()
      .post('/v1/creator/studio/videos/motion')
      .set(as('mia'))
      .send({ pieceId: pieces.visit, imageUrl: myPhoto, words: ['Ube', 'Latte'], cta: 'KAPE10' })
      .expect(200);
    expect(res.body.data).toMatchObject({ kind: 'MOTION', label: 'Edited' });
    const get = async () => (await http().get(`/v1/creator/studio/jobs/${res.body.data.id}`).set(as('mia'))).body.data;
    const job = (await waitForJob(get)) as { status: string; variants: { key: string; status: string; storyboardUrl: string; outputUrl: string }[] };
    expect(job.status).toBe('DONE');
    expect(job.variants).toHaveLength(3);
    expect(job.variants.every((v) => v.status === 'DONE' && v.storyboardUrl.includes('-board-') && v.outputUrl.endsWith('.mp4'))).toBe(true);
    expect(fakeMotion.requests.at(-1)).toMatchObject({ words: ['Ube', 'Latte'], cta: 'KAPE10', businessName: 'Kape Studio' });
    expect(job.variants[0].outputUrl).toContain(`videos/${mia.id}/`);

    const picked = await http().post(`/v1/creator/studio/videos/motion/${res.body.data.id}/pick`).set(as('mia')).send({ key: 'B' }).expect(200);
    expect(picked.body.data.picked).toBe('B');

    await http().post(`/v1/creator/studio/videos/motion/${res.body.data.id}/redo`).set(as('mia')).send({ key: 'C', words: ['Ube'] }).expect(200);
    const redone = (await waitForJob(get)) as unknown as { variants: { key: string; status: string }[] };
    expect(redone.variants.find((v) => v.key === 'C')!.status).toBe('DONE');
    expect(fakeMotion.requests.at(-1)!.words).toEqual(['Ube']);
  });
});
