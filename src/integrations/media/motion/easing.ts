/**
 * Easing and keyframes for motion templates. Pure functions, so timing is
 * easy to test. Never animate linearly: entrances ease out, exits ease in,
 * camera moves ease in and out (cebi-studio skill, "Motion design").
 */

export type Ease = (x: number) => number;

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

export const linear: Ease = (x) => x;
export const easeOutCubic: Ease = (x) => 1 - (1 - x) ** 3;
export const easeInCubic: Ease = (x) => x ** 3;
export const easeInOutCubic: Ease = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const easeOutQuint: Ease = (x) => 1 - (1 - x) ** 5;

/** Ease out with a small overshoot. `overshoot` is how far past the end it goes (0.08 = 8%). */
export const easeOutBack =
  (overshoot = 0.08): Ease =>
  (x) => {
    // Solve the classic back constant for the wanted peak overshoot.
    const c1 = 1.70158 * (overshoot / 0.1);
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  };

/** Progress (0 to 1) of `t` between `start` and `end`, eased. */
export const progress = (t: number, start: number, end: number, ease: Ease = easeInOutCubic) =>
  ease(clamp((t - start) / (end - start)));

/** A keyframe: at time `t` the value is `v`; `ease` shapes the move into this key. */
export interface Key {
  t: number;
  v: number;
  ease?: Ease;
}

/** The value of a keyframed track at time `t` (holds before the first key and after the last). */
export const track = (keys: Key[], t: number): number => {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) {
      const a = keys[i - 1];
      return lerp(a.v, b.v, (b.ease ?? easeInOutCubic)((t - a.t) / (b.t - a.t)));
    }
  }
  return keys[keys.length - 1].v;
};

/** Repeatable random numbers, so every render of a template is the same. */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Start times of `count` items landing on a beat grid (e.g. every 0.5 s at 120 BPM). */
export const onBeats = (start: number, count: number, beat = 0.5) => Array.from({ length: count }, (_, i) => start + i * beat);
