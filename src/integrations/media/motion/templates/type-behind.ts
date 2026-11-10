import { createCanvas, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, progress } from '../easing.js';
import { drawCover, fitInside, fitSize, FONT, layer, lightSweep, roundRect } from '../kit.js';
import { drawEndCard } from '../end-card.js';
import { H, SAFE, SAFE_CX, W, type MotionInput, type MotionTemplate } from '../types.js';

/**
 * Variation C, "type-behind": calm and premium, light cream.
 *   Hook (0 to 1.2 s): a huge word rises letter by letter behind the product, which floats in.
 *   Build (1.2 to 4 s): the huge word changes on the beat; the product slowly turns; a light sweep.
 *   Hero (4 to 7 s): slow push with depth (the product moves faster than the type), a caption.
 *   End card (7 to 9 s), light.
 */

const CREAM = '#FBF6EE';
const INK = '#1A120B';
const DEG = Math.PI / 180;
/** Where the product rests (its center), leaving room for the caption below. */
const REST_Y = 1000;

/** Mixes a hex color toward white. */
const tint = (hex: string, x: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * x));
  return `rgb(${c.join(',')})`;
};

/** No cut-out: the real photo as a rounded card. */
const photoCard = (photo: Image): Canvas => {
  const card = createCanvas(720, 900);
  const ctx = card.getContext('2d');
  ctx.save();
  roundRect(ctx, 0, 0, 720, 900, 40);
  ctx.clip();
  drawCover(ctx, photo, 1, 0, 0, { x: 0, y: 0, w: 720, h: 900 });
  ctx.restore();
  return card;
};

const prepare = (input: MotionInput) => {
  const { palette } = input;
  const product: Image | Canvas = input.cutout ?? photoCard(input.photo);
  const size = fitInside(product as Image, 740, 700);
  const words = (input.words.length ? input.words : [input.business.name]).slice(0, 3).map((w) => w.toUpperCase());
  // The huge word changes on these beats.
  const swaps = words.map((_, i) => 0.15 + i * 1.45);
  const measure = createCanvas(10, 10).getContext('2d');
  const bigSize = words.map((w) => Math.min(380, fitSize(measure, w, FONT.display, W - 60, 380)));
  const productLayer = layer();
  const bg = tint(palette.accent, 0.82);

  const drawBackground = (ctx: SKRSContext2D) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, CREAM);
    g.addColorStop(1, bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  /** The huge word: letters rise one by one, then leave upward when the next word comes. */
  const drawBigWord = (ctx: SKRSContext2D, t: number, push: number) => {
    words.forEach((word, i) => {
      const start = swaps[i];
      // Each word leaves just before the next one rises.
      const end = i < words.length - 1 ? swaps[i + 1] - 0.3 : 6.6;
      if (t < start || t > end + 0.3) return;
      const out = progress(t, end, end + 0.28, easeInCubic);
      ctx.save();
      ctx.font = `${bigSize[i]}px "${FONT.display}"`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.accent;
      const total = ctx.measureText(word).width;
      let x = W / 2 - total / 2;
      const y = 780 - push * 30;
      [...word].forEach((ch, k) => {
        const w = ctx.measureText(ch).width;
        // Letters stagger by about 2 frames.
        const p = progress(t, start + k * 0.06, start + k * 0.06 + 0.5, easeOutBack(0.06));
        ctx.globalAlpha = Math.min(1, p * 1.6) * (1 - out) * 0.92;
        ctx.fillText(ch, x, y + (1 - p) * 160 - out * 140);
        x += w;
      });
      ctx.restore();
    });
  };

  const drawProduct = (ctx: SKRSContext2D, t: number, push: number) => {
    const enter = progress(t, 0, 0.9, easeOutCubic);
    const float = Math.sin(t * 1.3) * 14;
    const turn = Math.sin(t * 0.7) * 3.5;
    const scale = (0.9 + 0.1 * enter) * (1 + push * 0.14);
    const cx = SAFE_CX;
    const cy = REST_Y + (1 - enter) * 90 + float - push * 80;

    // Soft contact shadow.
    ctx.save();
    ctx.globalAlpha = 0.22 * enter;
    const floor = REST_Y + size.h / 2 + 30;
    const g = ctx.createRadialGradient(cx, floor, 0, cx, floor, size.w * 0.5);
    g.addColorStop(0, 'rgba(60,40,20,1)');
    g.addColorStop(1, 'rgba(60,40,20,0)');
    ctx.fillStyle = g;
    ctx.setTransform(1, 0, 0, 0.16, 0, floor * 0.84);
    ctx.fillRect(cx - size.w, floor - size.w, size.w * 2, size.w * 2);
    ctx.restore();

    const p = productLayer.ctx;
    p.clearRect(0, 0, W, H);
    p.save();
    p.translate(cx, cy);
    p.rotate(turn * DEG);
    p.scale(scale, scale);
    p.drawImage(product, -size.w / 2, -size.h / 2, size.w, size.h);
    p.restore();
    const sweep = progress(t, 2.2, 3.4, easeInOutCubic);
    if (sweep > 0 && sweep < 1) lightSweep(p, -300 + sweep * (W + 600), 300, H, 0.32);

    ctx.save();
    ctx.globalAlpha = Math.min(1, enter * 1.4);
    ctx.shadowColor = 'rgba(60,40,20,0.28)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 40;
    ctx.drawImage(productLayer.canvas, 0, 0);
    ctx.restore();
  };

  const drawCaption = (ctx: SKRSContext2D, t: number) => {
    if (!input.words.length) return;
    const inP = progress(t, 4.6, 5.1, easeOutCubic);
    const outP = progress(t, 6.6, 6.95, easeInCubic);
    if (inP <= 0 || outP >= 1) return;
    ctx.save();
    ctx.font = `60px "${FONT.clean}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = inP * (1 - outP);
    ctx.fillStyle = INK;
    ctx.fillText(input.words.join(' '), SAFE_CX, SAFE.bottom - 40 + (1 - inP) * 30, SAFE.right - SAFE.left - 40);
    ctx.restore();
  };

  return (ctx: SKRSContext2D, t: number) => {
    // Hero: a slow push; the product moves more than the type (depth).
    const push = progress(t, 4, 7, easeInOutCubic);
    drawBackground(ctx);
    if (t < 7.3) {
      drawBigWord(ctx, t, push);
      drawProduct(ctx, t, push);
      drawCaption(ctx, t);
    }
    drawEndCard(ctx, t, 7, input, product, 'light');
  };
};

export const typeBehind: MotionTemplate = {
  id: 'type-behind',
  duration: 9,
  storyboard: [0.9, 2.3, 5.4, 8.4],
  // Calm on purpose: nothing moves fast enough to need motion blur.
  blurAt: () => false,
  prepare,
};
