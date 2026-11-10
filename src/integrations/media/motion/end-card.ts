import type { Canvas, Image, SKRSContext2D } from '@napi-rs/canvas';
import { easeOutBack, easeOutCubic, progress } from './easing.js';
import { backdrop, bokeh, drawBokeh, fitInside, fitSize, FONT, roundRect, shadowText } from './kit.js';
import { H, SAFE, SAFE_CX, W, type MotionInput } from './types.js';

/** Dark: warm studio. Light: cream, for calm premium looks. */
export type EndCardTheme = 'dark' | 'light';

const LIGHT = { bg: '#FBF6EE', ink: '#1A120B' };
const lights = bokeh(29, 14);

/**
 * The last 2 seconds of every variation: the logo (or the product when there
 * is no logo), the business name, the brief's CTA and handle. Everything
 * settles by `start + 0.95` and then holds still. Text is drawn with real
 * fonts and the logo is the business's own file; AI never draws either.
 */
export const drawEndCard = (
  ctx: SKRSContext2D,
  t: number,
  start: number,
  input: MotionInput,
  product: Image | Canvas,
  theme: EndCardTheme = 'dark',
) => {
  if (t < start) return;
  const at = (a: number, b: number, ease = easeOutCubic) => progress(t, start + a, start + b, ease);
  const { palette } = input;
  const ink = theme === 'dark' ? palette.ink : LIGHT.ink;

  ctx.save();
  ctx.globalAlpha = at(0, 0.35);
  if (theme === 'dark') {
    backdrop(ctx, palette, SAFE_CX, 900, H * 0.6);
    drawBokeh(ctx, lights, t, palette.accent, 0.2, 30);
  } else {
    ctx.fillStyle = LIGHT.bg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const logo = input.business.logo;
  let y = 800;
  const picture = logo ?? product;
  const fit = logo ? fitInside(logo, 440, 280) : fitInside(product as Image, 600, 460);
  const cy = logo ? y : 640;
  const s = at(logo ? 0.25 : 0.1, logo ? 0.7 : 0.55, easeOutBack(0.08));
  ctx.save();
  ctx.globalAlpha = at(logo ? 0.25 : 0.1, logo ? 0.4 : 0.25);
  ctx.translate(SAFE_CX, cy + (logo ? 0 : (1 - s) * 120));
  ctx.scale(0.65 + 0.35 * s, 0.65 + 0.35 * s);
  if (!logo) {
    ctx.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(60,40,20,0.25)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 30;
  }
  ctx.drawImage(picture, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  ctx.restore();
  y = cy + fit.h / 2 + (logo ? 110 : 130);

  const nameSize = fitSize(ctx, input.business.name, FONT.clean, SAFE.right - SAFE.left - 60, logo ? 84 : 110);
  const n = at(0.25, 0.65, easeOutBack(0.06));
  ctx.save();
  ctx.globalAlpha = at(0.25, 0.4);
  ctx.font = `${nameSize}px "${FONT.clean}"`;
  if (theme === 'dark') shadowText(ctx, input.business.name, SAFE_CX, y + (1 - n) * 40, ink, 16);
  else {
    ctx.fillStyle = ink;
    ctx.fillText(input.business.name, SAFE_CX, y + (1 - n) * 40);
  }
  ctx.restore();
  y += nameSize / 2 + 100;

  if (input.cta) {
    const c = at(0.4, 0.8, easeOutBack(0.1));
    ctx.save();
    ctx.font = `56px "${FONT.clean}"`;
    const tw = Math.min(ctx.measureText(input.cta).width, SAFE.right - SAFE.left - 120);
    ctx.globalAlpha = at(0.4, 0.52);
    ctx.translate(SAFE_CX, y);
    ctx.scale(0.8 + 0.2 * c, 0.8 + 0.2 * c);
    ctx.fillStyle = palette.accent;
    roundRect(ctx, -tw / 2 - 44, -54, tw + 88, 108, 54);
    ctx.fill();
    ctx.fillStyle = '#1A120B';
    ctx.fillText(input.cta, 0, 2, tw);
    ctx.restore();
    y += 130;
  }
  if (input.handle) {
    const h = at(0.6, 0.95);
    ctx.save();
    ctx.globalAlpha = 0.85 * h;
    ctx.font = `46px "${FONT.cleanBold}"`;
    ctx.fillStyle = ink;
    ctx.fillText(input.handle, SAFE_CX, y + (1 - h) * 24);
    ctx.restore();
  }
};
