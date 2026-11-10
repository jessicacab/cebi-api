import type { CreateCampaignDto } from './dto/campaign.dto.js';
import { costOf, paymentProblems, timelineProblems, todayInManila } from './campaign-rules.js';

const base = {
  payment: 'FIXED',
  cashPerCreator: 2500,
  applyBy: '2026-10-10',
  contentDue: '2026-10-12',
  publishStart: '2026-10-13',
  publishEnd: '2026-10-30',
} as CreateCampaignDto;

describe('campaign rules', () => {
  it('uses the calendar day in Manila', () => {
    // 20:00 UTC on Oct 12 is already Oct 13 in Manila (UTC+8).
    expect(todayInManila(new Date('2026-10-12T20:00:00Z'))).toBe('2026-10-13');
  });

  it('accepts dates in order', () => {
    expect(timelineProblems(base, true, '2026-10-01')).toEqual([]);
  });

  it('catches dates out of order', () => {
    expect(timelineProblems({ ...base, applyBy: '2026-09-30' }, true, '2026-10-01')).toContain('applyBy can not be in the past');
    expect(timelineProblems({ ...base, contentDue: '2026-10-31' }, true, '2026-10-01')).toContain(
      'contentDue can not be after publishEnd',
    );
    expect(timelineProblems({ ...base, publishEnd: undefined }, true, '2026-10-01')).toContain(
      'publishStart and publishEnd are required when creators post',
    );
  });

  it('does not need publishing dates when creators only hand over files', () => {
    expect(timelineProblems({ ...base, publishStart: undefined, publishEnd: undefined }, false, '2026-10-01')).toEqual([]);
  });

  it('needs an amount for every part of the payment', () => {
    expect(paymentProblems(base)).toEqual([]);
    expect(paymentProblems({ ...base, payment: 'HYBRID', hybridParts: ['FIXED'] })).toContain(
      'hybridParts must have at least two items',
    );
    expect(paymentProblems({ ...base, payment: 'HYBRID', hybridParts: ['FIXED', 'PRODUCT'] })).toEqual([
      'product is required for a free product',
    ]);
  });

  it('adds the Cebi fee only when payments go through Cebi', () => {
    const launch = { paymentsInApp: false, feePercent: 10 };
    const inApp = { paymentsInApp: true, feePercent: 10 };
    expect(costOf(2500, 5, launch)).toEqual({ cash: 12500, fee: 0, total: 12500, paidInApp: false });
    expect(costOf(2500, 5, inApp)).toEqual({ cash: 12500, fee: 1250, total: 13750, paidInApp: true });
    expect(costOf(null, 5, inApp)).toEqual({ cash: 0, fee: 0, total: 0, paidInApp: true });
  });
});

describe('campaign estimate', () => {
  it('adds up views per post, platform and creator', async () => {
    const { estimateViews } = await import('./campaign-estimate.js');
    const deliverables = [
      { format: 'VIDEO', count: 1 },
      { format: 'PHOTO', count: 1 },
    ] as CreateCampaignDto['deliverables'];
    // TikTok 1,500 to 6,000 per video, photos at half: 2,250 to 9,000 per creator, times 2.
    expect(estimateViews({ platforms: ['TIKTOK'], deliverables, slots: 2 }, true)).toEqual({ low: 4500, high: 18000 });
    expect(estimateViews({ platforms: ['TIKTOK'], deliverables, slots: 2 }, false)).toBeNull();
  });
});

describe('campaign goals', () => {
  it('needs an end per target and low not above high', async () => {
    const { goalProblems, goalsToJson } = await import('./campaign-goals.js');
    expect(goalProblems({ impressions: { min: 1000, max: 5000 }, ctr: { min: 1.5 } })).toEqual([]);
    expect(goalProblems({ clicks: {}, cpc: { min: 5, max: 2 } })).toEqual([
      'goals.clicks needs a min or a max',
      'goals.cpc: min can not be more than max',
    ]);
    expect(goalsToJson({ reach: { max: 9000 }, clicks: {} })).toEqual({ reach: { max: 9000 } });
    expect(goalsToJson({})).toBeNull();
  });
});

describe('creator checklist', () => {
  it('repeats every line on every platform, once for UGC', async () => {
    const { piecesFor, isLate, changesAllowed } = await import('./campaign-pieces.js');
    const campaign = {
      deliverables: [
        { format: 'VIDEO', count: 2, minSeconds: 30, maxSeconds: 60 },
        { format: 'PHOTO', count: 1 },
      ],
      platforms: ['TIKTOK', 'INSTAGRAM'],
    } as never;
    const pieces = piecesFor(campaign, { postsOnCreatorAccount: true });
    expect(pieces).toHaveLength(6);
    expect(pieces[1]).toEqual({ format: 'VIDEO', platform: 'TIKTOK', number: 2, minSeconds: 30, maxSeconds: 60 });
    expect(piecesFor(campaign, { postsOnCreatorAccount: false }).map((p) => p.platform)).toEqual([null, null, null]);

    expect(isLate('TODO', '2026-10-10', '2026-10-11')).toBe(true);
    expect(isLate('SUBMITTED', '2026-10-10', '2026-10-11')).toBe(false);
    expect(isLate('TODO', '2026-10-11', '2026-10-11')).toBe(false);
    expect(changesAllowed({ revisions: 0 })).toBe(1);
    expect(changesAllowed({ revisions: 3 })).toBe(3);
  });
});

describe('campaign fit for a creator', () => {
  it('scores city, interests and platforms, and rules out other platforms', async () => {
    const { matchFit } = await import('./campaign-match.js');
    const base = {
      campaignPlatforms: ['TIKTOK', 'INSTAGRAM'],
      businessCity: 'Cebu City',
      businessCategory: 'restaurant',
      creatorPlatforms: ['TIKTOK'],
      creatorCity: 'cebu city',
      creatorNiches: ['food'],
    } as Parameters<typeof matchFit>[0];
    expect(matchFit(base)).toEqual({ score: 95, reasons: ['In Cebu City', 'Fits your food content', 'You post on TikTok'] });
    expect(matchFit({ ...base, creatorCity: 'Manila', creatorNiches: ['tech'] })?.score).toBe(45);
    expect(matchFit({ ...base, creatorPlatforms: ['YOUTUBE'] })).toBeNull();
  });
});

describe('AI writing suggestions', () => {
  it('builds the prompt from the facts and cleans the answer', async () => {
    const { cleanSuggestions, suggestPrompt } = await import('./campaign-suggestions.js');
    const prompt = suggestPrompt({
      field: 'hashtags',
      businessName: 'Kape Kalye',
      businessCategory: 'Café',
      city: 'Cebu City',
      contentType: 'Store Visit / Experience',
      platforms: ['TikTok'],
      brief: 'Ube latte',
      existing: ['#KapeKalye'],
    });
    expect(prompt).toContain('Kape Kalye (Café) in Cebu City');
    expect(prompt).toContain('What they are promoting: Ube latte');
    expect(prompt).toContain('Do not repeat these');

    expect(cleanSuggestions({ suggestions: ['Ube Latte Cebu', '#kapekalye', '#CebuEats', '#CebuEats', '  '] }, 'hashtags', ['#KapeKalye'])).toEqual([
      '#UbeLatteCebu',
      '#CebuEats',
    ]);
    expect(cleanSuggestions({ suggestions: ['Mention the price \u2014 only P99'] }, 'talkingPoints', [])).toEqual(['Mention the price, only P99']);
    expect(cleanSuggestions({ nope: true }, 'title', [])).toEqual([]);
  });
});

describe('AI Quick match', () => {
  it('keeps only known campaigns, clamps scores and caches for the day', async () => {
    const { cleanMatches, MatchCache } = await import('./campaign-ai-match.js');
    const scores = cleanMatches(
      { picks: [{ id: 'a', score: 120, reason: 'Your food videos fit  this.' }, { id: 'x', score: 50, reason: 'Unknown' }, { id: 'a', score: 1, reason: 'dup' }] },
      ['a', 'b'],
    );
    expect([...scores.entries()]).toEqual([['a', { score: 99, reason: 'Your food videos fit this.' }]]);
    expect(cleanMatches({ wrong: 1 }, ['a']).size).toBe(0);

    const cache = new MatchCache();
    expect(cache.stale('me', '2026-11-09', ['a'], 0)).toBe(true);
    cache.set('me', '2026-11-09', scores, 0);
    expect(cache.stale('me', '2026-11-09', ['a'], 1000)).toBe(false);
    expect(cache.stale('me', '2026-11-09', ['a', 'b'], 1000)).toBe(false); // new one, but asked recently
    expect(cache.stale('me', '2026-11-09', ['a', 'b'], 31 * 60 * 1000)).toBe(true);
    expect(cache.stale('me', '2026-11-10', ['a'], 1000)).toBe(true); // a new day
  });
});
