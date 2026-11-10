import { ctaOptions, handleFrom, titleWords } from './motion-words.js';

describe('moving ad words', () => {
  it('takes short words from the campaign title, without filler', () => {
    expect(titleWords('New Cookie Flavor Product')).toEqual(['New', 'Cookie', 'Flavor']);
    expect(titleWords('Launch of the Boodle Feast')).toEqual(['Boodle', 'Feast']);
  });

  it("offers only the brief's own code, link and hashtags for the end card", () => {
    expect(ctaOptions({ link: 'KAPE10', hashtags: ['KapeCebu', '#KapeCebu'] })).toEqual(['KAPE10', '#KapeCebu']);
    expect(ctaOptions({ link: null, hashtags: [] })).toEqual([]);
  });

  it('uses the business Instagram handle, then TikTok', () => {
    expect(handleFrom({ tiktok: '@a', instagram: '@b' })).toBe('@b');
    expect(handleFrom(null)).toBeNull();
  });
});
