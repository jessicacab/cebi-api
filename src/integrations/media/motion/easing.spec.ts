import { easeInOutCubic, easeOutBack, onBeats, progress, seeded, track } from './easing.js';
import { maskBox } from '../cutout.js';

describe('motion easing', () => {
  it('eases between 0 and 1, with a small overshoot for back', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    const back = easeOutBack(0.08);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => back(i / 100)));
    expect(peak).toBeGreaterThan(1.03);
    expect(peak).toBeLessThan(1.12);
    expect(back(1)).toBeCloseTo(1);
  });

  it('reads keyframes and holds outside them', () => {
    const keys = [{ t: 1, v: 10 }, { t: 2, v: 20 }];
    expect(track(keys, 0)).toBe(10);
    expect(track(keys, 1.5)).toBeCloseTo(15);
    expect(track(keys, 3)).toBe(20);
    expect(progress(5, 0, 1)).toBe(1);
  });

  it('puts words on the beat and repeats random numbers for a seed', () => {
    expect(onBeats(1.3, 3, 0.5)).toEqual([1.3, 1.8, 2.3]);
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a()]).toEqual([b(), b()]);
  });

  it('finds the box around a cut-out mask', () => {
    const mask = new Uint8Array(16);
    mask[5] = mask[6] = mask[10] = 255;
    expect(maskBox(mask, 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 2, coverage: 3 / 16 });
    expect(maskBox(new Uint8Array(16), 4, 4)).toBeNull();
  });
});
