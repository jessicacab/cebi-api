import { animatePrompt, CLIP_MOTIONS } from './animate.js';
import { enhancePrompt, ENHANCE_STYLES, levelFor, stylesFor } from './enhance.js';
import { captionChecks, cleanPlan, withRequired } from './studio-plan.js';

describe('Enhance rules', () => {
  it('allows full styles only for ad-style campaigns', () => {
    expect(levelFor('ugc')).toBe('full');
    expect(levelFor('product-review')).toBe('full');
    expect(levelFor('store-visit')).toBe('light');
    expect(levelFor(null)).toBe('light');
    expect(stylesFor('light').map((s) => s.id)).toEqual(['light-fix']);
    expect(stylesFor('full').length).toBe(ENHANCE_STYLES.length);
  });

  it('always tells the model to keep the product and add no text', () => {
    const prompt = enhancePrompt(ENHANCE_STYLES.find((s) => s.id === 'light-fix')!);
    expect(prompt).toContain('Keep the main product or dish exactly as it is');
    expect(prompt).toContain('Do not add any text');
    expect(prompt).toContain('Do not change the background');
  });
});

describe('Studio plan and caption', () => {
  it('adds the required hashtags, mentions and link once', () => {
    const rules = { hashtags: ['#KapeCebu', '#UbeLatte'], mentions: ['@chefjuan'], link: 'KAPE10' };
    const caption = withRequired('Best ube latte in town #kapecebu', rules);
    expect(caption).toBe('Best ube latte in town #kapecebu\n\nKAPE10\n\n@chefjuan #UbeLatte');
    expect(captionChecks(caption, rules).every((c) => c.ok)).toBe(true);
    expect(captionChecks('Nothing here', rules).filter((c) => !c.ok)).toHaveLength(4);
  });

  it('checks and tidies the plan', () => {
    const plan = cleanPlan({
      hooks: [{ style: 'POV', text: 'POV: the ube latte \u2014 finally' }],
      shots: [{ time: '0 to 3s', text: 'Pour shot' }],
      script: 'Line one\nLine two',
      caption: 'So good',
    });
    expect(plan?.hooks[0].text).toBe('POV: the ube latte, finally');
    expect(plan?.script).toBe('Line one\nLine two');
    expect(cleanPlan({ nope: 1 })).toBeNull();
  });
});

describe('Animate a photo', () => {
  it('always keeps the product and adds no text or people', () => {
    for (const m of CLIP_MOTIONS) {
      const prompt = animatePrompt(m);
      expect(prompt).toContain('Keep the product exactly as it is in every frame');
      expect(prompt).toContain('Do not add any text, words, logos, watermarks or people');
    }
  });
});
