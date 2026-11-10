import { createCanvas, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { easeInCubic, easeOutBack, easeOutCubic, easeOutQuint, onBeats, progress, track } from '../easing.js';
import {
  backdrop,
  bokeh,
  burst,
  drawBokeh,
  drawBurst,
  drawCover,
  fitInside,
  fitSize,
  FONT,
  layer,
  lightSweep,
  roundRect,
  shadowText,
  vignette,
} from '../kit.js';
import { drawEndCard } from '../end-card.js';
import { H, SAFE, SAFE_CX, W, type MotionInput, type MotionTemplate } from '../types.js';

/**
 * Variation A, "hero-reveal": energetic, dark warm studio.
 *   Hook (0 to 1.2 s): the product flies in from below and lands with a dust burst and a light sweep.
 *   Build (1.2 to 4 s): the brief's words land one per beat above the floating product.
 *   Hero (4 to 7 s): zoom-through into the full real photo, slow push, light leak, a caption.
 *   End card (7 to 9 s): logo (or name), CTA and handle, holding still for the last 1.2 s.
 */

const DEG = Math.PI / 180;

/** No cut-out found: the real photo as a rounded card stands in for the product. */
const photoCard = (photo: Image): Canvas => {
  const w = 760;
  const h = 950;
  const card = createCanvas(w + 24, h + 24);
  const ctx = card.getContext('2d');
  roundRect(ctx, 0, 0, w + 24, h + 24, 44);
  ctx.fillStyle = '#FFF7EC';
  ctx.fill();
  ctx.save();
  roundRect(ctx, 12, 12, w, h, 34);
  ctx.clip();
  drawCover(ctx, photo, 1, 0, 0, { x: 12, y: 12, w, h });
  ctx.restore();
  return card;
};

const prepare = (input: MotionInput) => {
  const { palette } = input;
  const product: Image | Canvas = input.cutout ?? photoCard(input.photo);
  const words = input.words.slice(0, 4).map((w) => w.toUpperCase());
  const size = fitInside(product as Image, 800, words.length ? 700 : 900);
  const restY = words.length ? 1300 : 1060;
  const productLayer = layer();
  const dust = burst(7, 150, SAFE_CX, restY + size.h / 2 - 20, 1100, [2, 6]);
  const lights = bokeh(3, 16);
  const specks = bokeh(11, 26);
  const wordTimes = onBeats(1.3, words.length, 0.5);

  // Word sizes are worked out once: each fills the safe width, up to 210 px tall.
  const measure = createCanvas(10, 10).getContext('2d');
  const wordSizes = words.map((w) => fitSize(measure, w, FONT.display, SAFE.right - SAFE.left - 40, 210));
  const wordY = (i: number) => SAFE.top + 40 + wordSizes.slice(0, i + 1).reduce((a, s) => a + s * 0.98, 0) - wordSizes[0] * 0.98 + wordSizes[i] * 0.5;

  const drawProduct = (ctx: SKRSContext2D, t: number) => {
    // Fly in, land with a small overshoot, then float.
    const fly = track([{ t: 0, v: 1250 }, { t: 0.85, v: 0, ease: easeOutBack(0.08) }], t);
    const settle = track([{ t: 0.9, v: 0 }, { t: 1.6, v: 1 }], t);
    const float = Math.sin((t - 0.9) * 2.2) * 12 * settle;
    const rot = track([{ t: 0, v: -14 }, { t: 0.95, v: 0, ease: easeOutBack(0.06) }], t) + Math.sin(t * 1.4) * 1.2 * settle;
    let scale = track([{ t: 0, v: 0.78 }, { t: 0.85, v: 1, ease: easeOutCubic }], t);
    let cx = SAFE_CX;
    let cy = restY + fly + float;
    let alpha = 1;
    // Zoom-through: the product rushes at the camera and opens into the photo.
    if (t > 3.95) {
      const z = progress(t, 3.95, 4.55, easeInCubic);
      scale *= 1 + z * 5;
      cx += (W / 2 - cx) * z;
      cy += (H / 2 - cy) * z;
      alpha = 1 - progress(t, 4.35, 4.6, easeOutCubic);
    }
    if (alpha <= 0) return;

    // Contact shadow on the "floor", softer while the product is in the air.
    const lift = Math.min(1, Math.abs(fly) / 600);
    if (t < 4.2) {
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - lift) * alpha;
      const g = ctx.createRadialGradient(cx, restY + size.h / 2, 0, cx, restY + size.h / 2, size.w * 0.45);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.setTransform(1, 0, 0, 0.18, 0, (restY + size.h / 2) * 0.82);
      ctx.fillRect(cx - size.w, restY + size.h / 2 - size.w, size.w * 2, size.w * 2);
      ctx.restore();
    }

    // The product on its own layer, so the light sweep only touches the product.
    const p = productLayer.ctx;
    p.clearRect(0, 0, W, H);
    p.save();
    p.translate(cx, cy);
    p.rotate(rot * DEG);
    p.scale(scale, scale);
    p.drawImage(product, -size.w / 2, -size.h / 2, size.w, size.h);
    p.restore();
    const sweep = progress(t, 0.7, 1.6, easeOutCubic);
    if (sweep > 0 && sweep < 1) lightSweep(p, -300 + sweep * (W + 600), 260, H, 0.28);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 36;
    ctx.drawImage(productLayer.canvas, 0, 0);
    ctx.restore();
  };

  const drawWords = (ctx: SKRSContext2D, t: number) => {
    if (t > 4.4) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    words.forEach((word, i) => {
      const start = wordTimes[i];
      if (t < start) return;
      const inP = progress(t, start, start + 0.38, easeOutBack(0.08));
      const exitStart = 3.85 + i * 0.1;
      const outP = progress(t, exitStart, exitStart + 0.28, easeInCubic);
      const y = wordY(i) + (1 - inP) * 70 - outP * 90;
      const scale = 1.25 - 0.25 * inP;
      const alpha = progress(t, start, start + 0.15, easeOutCubic) * (1 - outP);
      if (alpha <= 0) return;
      const last = i === words.length - 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(SAFE_CX, y);
      ctx.scale(scale, scale);
      ctx.font = `${wordSizes[i]}px "${FONT.display}"`;
      // An accent bar wipes in under the last word.
      if (last) {
        const wipe = progress(t, start + 0.15, start + 0.45, easeOutCubic) * (1 - outP);
        const tw = ctx.measureText(word).width;
        ctx.fillStyle = palette.accent;
        roundRect(ctx, -tw / 2, wordSizes[i] * 0.42, tw * wipe, 18, 9);
        ctx.fill();
      }
      shadowText(ctx, word, 0, 0, last ? palette.accent : palette.ink);
      ctx.restore();
    });
  };

  const drawPhoto = (ctx: SKRSContext2D, t: number) => {
    if (t < 4.3 || t > 7.2) return;
    const scale = track(
      [
        { t: 4.3, v: 1.6 },
        { t: 4.8, v: 1, ease: easeOutQuint },
        { t: 6.8, v: 1.07 },
        { t: 7.2, v: 1.3, ease: easeInCubic },
      ],
      t,
    );
    ctx.save();
    ctx.globalAlpha = progress(t, 4.3, 4.5, easeOutCubic);
    drawCover(ctx, input.photo, scale);
    ctx.restore();
    vignette(ctx, 0.35);

    // A warm light leak drifting across.
    const leak = progress(t, 4.8, 6.6);
    if (leak > 0 && leak < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.sin(leak * Math.PI) * 0.35;
      const x = -200 + leak * (W + 400);
      const g = ctx.createRadialGradient(x, H * 0.3, 0, x, H * 0.3, 700);
      g.addColorStop(0, palette.accent);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // Floating specks in front of the photo (they move faster: depth).
    drawBokeh(ctx, specks, t, 'rgba(255,247,236,1)', 0.12, 140);

    // Caption: the brief's words, in a plate low in the safe area.
    if (words.length) {
      const inP = progress(t, 5.1, 5.5, easeOutBack(0.06));
      const outP = progress(t, 6.4, 6.7, easeInCubic);
      if (inP > 0 && outP < 1) {
        const text = input.words.join(' ');
        ctx.save();
        ctx.font = `64px "${FONT.clean}"`;
        const tw = Math.min(ctx.measureText(text).width, SAFE.right - SAFE.left - 80);
        const x = SAFE_CX + (1 - inP) * -260 + outP * 260;
        ctx.globalAlpha = Math.min(1, inP * 1.5) * (1 - outP);
        ctx.fillStyle = 'rgba(16,10,6,0.62)';
        roundRect(ctx, x - tw / 2 - 36, SAFE.bottom - 160, tw + 72, 112, 22);
        ctx.fill();
        ctx.fillStyle = palette.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, SAFE.bottom - 104, tw);
        ctx.restore();
      }
    }
  };

  return (ctx: SKRSContext2D, t: number) => {
    // The studio backdrop breathes open in the first moments.
    backdrop(ctx, palette, SAFE_CX, restY, H * (0.45 + 0.3 * progress(t, 0, 0.6, easeOutCubic)));
    drawBokeh(ctx, lights, t, palette.accent, 0.16, 30);
    drawPhoto(ctx, t);
    if (t < 4.7) {
      drawBurst(ctx, dust, t - 0.72, '#FFF3E0');
      drawProduct(ctx, t);
      drawWords(ctx, t);
    }
    drawEndCard(ctx, t, 6.8, input, product, 'dark');
  };
};

export const heroReveal: MotionTemplate = {
  id: 'hero-reveal',
  duration: 9,
  storyboard: [0.62, 2.9, 5.6, 8.4],
  blurAt: (t) => t < 0.75 || (t > 4.05 && t < 4.75),
  prepare,
};
