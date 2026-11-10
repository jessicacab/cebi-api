import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import { easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, progress } from '../easing.js';
import { fitSize, FONT, roundRect, shadowText, vignette } from '../kit.js';
import { drawEndCard } from '../end-card.js';
import { H, SAFE, SAFE_CX, W, type MotionInput, type MotionTemplate } from '../types.js';

/**
 * Variation B, "box-tour": rhythmic, the real photo and its real context.
 *   Hook (0 to 1.6 s): already close on the first detail, a word lands.
 *   Build (1.6 to 5.2 s): whip pans with motion blur to two more details, a word on each.
 *   Hero (5.2 to 6.9 s): pull back to the whole photo, slow push, the words together.
 *   End card (6.9 to 9 s).
 * The photo's pixels are only moved and scaled, never changed.
 */

interface Stop {
  /** Point of the photo (pixels) in the middle of the frame. */
  x: number;
  y: number;
  zoom: number;
}

/** Three details to visit: across the product (or the photo) along its longer side. */
export const tourStops = (photo: { width: number; height: number }, box?: MotionInput['productBox']): Stop[] => {
  const b = box ?? { x: photo.width * 0.15, y: photo.height * 0.2, width: photo.width * 0.7, height: photo.height * 0.6 };
  const wide = b.width >= b.height;
  const at = (f: number) =>
    wide ? { x: b.x + b.width * f, y: b.y + b.height * 0.5 } : { x: b.x + b.width * 0.5, y: b.y + b.height * f };
  return [
    { ...at(0.22), zoom: 2.3 },
    { ...at(0.55), zoom: 2.1 },
    { ...at(0.85), zoom: 2.4 },
  ];
};

/** Times: hold on each stop, whip between them. */
const STOPS_AT = [0, 1.95, 3.75];
const WHIPS = [
  [1.6, 1.95],
  [3.4, 3.75],
];
const PULL = [5.2, 6.0];
const END = 6.9;

const prepare = (input: MotionInput) => {
  const { photo, palette } = input;
  const stops = tourStops(photo, input.productBox);
  const whole: Stop = { x: photo.width / 2, y: photo.height / 2, zoom: 1 };
  const words = input.words.slice(0, 3).map((w) => w.toUpperCase());
  const base = Math.max(W / photo.width, H / photo.height);

  /** The camera at time t: holding on a stop with a gentle drift, or whipping to the next. */
  const camera = (t: number): Stop => {
    const lerpStop = (a: Stop, b: Stop, x: number): Stop => ({ x: a.x + (b.x - a.x) * x, y: a.y + (b.y - a.y) * x, zoom: a.zoom + (b.zoom - a.zoom) * x });
    let cam = stops[0];
    if (t >= WHIPS[0][0]) cam = lerpStop(stops[0], stops[1], progress(t, WHIPS[0][0], WHIPS[0][1], easeInOutCubic));
    if (t >= WHIPS[1][0]) cam = lerpStop(stops[1], stops[2], progress(t, WHIPS[1][0], WHIPS[1][1], easeInOutCubic));
    if (t >= PULL[0]) cam = lerpStop(stops[2], whole, progress(t, PULL[0], PULL[1], easeInOutCubic));
    // Never a still frame: a slow push while holding.
    const hold = t < WHIPS[0][0] ? t : t < WHIPS[1][0] ? t - 1.95 : t < PULL[0] ? t - 3.75 : t - PULL[1];
    return { ...cam, zoom: cam.zoom * (1 + 0.03 * Math.max(0, hold)) };
  };

  const drawPhoto = (ctx: SKRSContext2D, t: number) => {
    const cam = camera(t);
    const s = base * cam.zoom;
    // Keep the frame covered by the photo.
    const ox = Math.min(0, Math.max(W - photo.width * s, W / 2 - cam.x * s));
    const oy = Math.min(0, Math.max(H - photo.height * s, H * 0.45 - cam.y * s));
    ctx.fillStyle = palette.deep;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(photo as Image, ox, oy, photo.width * s, photo.height * s);
    vignette(ctx, 0.4);
  };

  /** One word per stop, on an accent plate that slides in the pan direction. */
  const drawStopWord = (ctx: SKRSContext2D, t: number, i: number) => {
    const word = words[i];
    if (!word) return;
    const start = STOPS_AT[i] + (i === 0 ? 0.3 : 0.05);
    const end = i < 2 ? WHIPS[i][0] + 0.12 : PULL[0] + 0.1;
    if (t < start || t > end) return;
    const inP = progress(t, start, start + 0.35, easeOutBack(0.08));
    const outP = progress(t, end - 0.25, end, easeInCubic);
    const size = fitSize(ctx, word, FONT.display, SAFE.right - SAFE.left - 100, 180);
    ctx.save();
    ctx.font = `${size}px "${FONT.display}"`;
    const tw = ctx.measureText(word).width;
    const y = SAFE.bottom - 200;
    const x = SAFE_CX + (1 - inP) * 220 - outP * 420;
    ctx.globalAlpha = Math.min(1, inP * 1.4) * (1 - outP);
    ctx.fillStyle = palette.accent;
    const plate = progress(t, start, start + 0.3, easeOutCubic);
    roundRect(ctx, x - tw / 2 - 30, y - size * 0.58, (tw + 60) * plate, size * 1.1, 18);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    shadowText(ctx, word, x, y + size * 0.02, '#FFFFFF', 18);
    ctx.restore();
  };

  /** After the pull back: all the words together, in a calm caption. */
  const drawCaption = (ctx: SKRSContext2D, t: number) => {
    if (!words.length || t < PULL[1] - 0.1 || t > END + 0.2) return;
    const inP = progress(t, PULL[1] - 0.1, PULL[1] + 0.3, easeOutBack(0.06));
    const outP = progress(t, END - 0.25, END + 0.05, easeInCubic);
    const text = input.words.join(' ');
    ctx.save();
    ctx.font = `64px "${FONT.clean}"`;
    const tw = Math.min(ctx.measureText(text).width, SAFE.right - SAFE.left - 80);
    ctx.globalAlpha = Math.min(1, inP * 1.5) * (1 - outP);
    ctx.fillStyle = 'rgba(16,10,6,0.62)';
    roundRect(ctx, SAFE_CX - tw / 2 - 36, SAFE.bottom - 160 + (1 - inP) * 40, tw + 72, 112, 22);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, SAFE_CX, SAFE.bottom - 104 + (1 - inP) * 40, tw);
    ctx.restore();
  };

  return (ctx: SKRSContext2D, t: number) => {
    drawPhoto(ctx, t);
    // A quick white flash on each whip's peak, like a camera snap.
    for (const [a, b] of WHIPS) {
      const f = Math.sin(progress(t, a + 0.1, b - 0.05, (x) => x) * Math.PI);
      if (f > 0) {
        ctx.save();
        ctx.globalAlpha = f * 0.12;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    for (let i = 0; i < 3; i++) drawStopWord(ctx, t, i);
    drawCaption(ctx, t);
    drawEndCard(ctx, t, END, input, input.cutout ?? input.photo, 'dark');
  };
};

export const boxTour: MotionTemplate = {
  id: 'box-tour',
  duration: 9,
  storyboard: [0.9, 2.7, 6.3, 8.4],
  blurAt: (t) => WHIPS.some(([a, b]) => t > a + 0.03 && t < b - 0.02) || (t > PULL[0] + 0.15 && t < PULL[1] - 0.2),
  prepare,
};
