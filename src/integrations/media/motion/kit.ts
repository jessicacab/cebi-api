import { createCanvas, GlobalFonts, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'node:path';
import { seeded } from './easing.js';
import { H, W, type Palette } from './types.js';

/**
 * Shared drawing pieces for motion templates: fonts, the palette from the
 * photo, placing the photo, particles, light and type.
 */

/** Display face (big kinetic words) and the clean face (names, CTA). Both SIL Open Font License. */
export const FONT = { display: 'Anton', clean: 'Nunito Black', cleanBold: 'Nunito ExtraBold' } as const;

let fontsReady = false;
export const registerFonts = (dir = join(process.cwd(), 'assets', 'fonts')) => {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(join(dir, 'Anton-Regular.ttf'), FONT.display);
  GlobalFonts.registerFromPath(join(dir, 'Nunito_900Black.ttf'), FONT.clean);
  GlobalFonts.registerFromPath(join(dir, 'Nunito_800ExtraBold.ttf'), FONT.cleanBold);
  fontsReady = true;
};

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mixes an RGB color toward another (0 = first, 1 = second). */
const mix = (a: number[], b: number[], x: number) => a.map((v, i) => v + (b[i] - v) * x);

/** A grade from the photo: deep and glow tones from its average color, accent from its most vivid one. */
export const paletteFrom = (photo: Image): Palette => {
  const size = 24;
  const ctx = createCanvas(size, size).getContext('2d');
  ctx.drawImage(photo, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  let sum = [0, 0, 0];
  let vivid = [200, 120, 60];
  let best = -1;
  for (let i = 0; i < px.length; i += 4) {
    const rgb = [px[i], px[i + 1], px[i + 2]];
    sum = sum.map((v, k) => v + rgb[k]);
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    // Vivid and not too dark or too light.
    const score = (max - min) * (1 - Math.abs(max - 170) / 170);
    if (score > best) {
      best = score;
      vivid = rgb;
    }
  }
  const mean = sum.map((v) => v / (size * size));
  return {
    deep: hex(...(mix(mean, [8, 6, 5], 0.82) as [number, number, number])),
    glow: hex(...(mix(mean, [40, 24, 14], 0.45) as [number, number, number])),
    accent: hex(...(mix(vivid, [255, 255, 255], 0.12) as [number, number, number])),
    ink: '#FFF7EC',
  };
};

/** Draws an image to cover a box (like CSS object-fit: cover), scaled around its center. */
export const drawCover = (ctx: SKRSContext2D, img: Image | Canvas, scale = 1, dx = 0, dy = 0, box = { x: 0, y: 0, w: W, h: H }) => {
  const s = Math.max(box.w / img.width, box.h / img.height) * scale;
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, box.x + (box.w - w) / 2 + dx, box.y + (box.h - h) / 2 + dy, w, h);
};

/** The studio backdrop: a radial glow from the photo's colors and a vignette. */
export const backdrop = (ctx: SKRSContext2D, palette: Palette, cx = W / 2, cy = H * 0.55, radius = H * 0.75) => {
  ctx.fillStyle = palette.deep;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, palette.glow);
  g.addColorStop(1, palette.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  vignette(ctx, 0.55);
};

export const vignette = (ctx: SKRSContext2D, strength = 0.5) => {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

/** A soft diagonal band of light moving across what is already drawn (use on a layer). */
export const lightSweep = (ctx: SKRSContext2D, x: number, width: number, h: number, alpha = 0.3) => {
  const g = ctx.createLinearGradient(x - width, 0, x + width, h * 0.35);
  g.addColorStop(0, 'rgba(255,248,235,0)');
  g.addColorStop(0.5, `rgba(255,248,235,${alpha})`);
  g.addColorStop(1, 'rgba(255,248,235,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
};

/** A reusable transparent layer the size of the frame. */
export const layer = () => {
  const canvas = createCanvas(W, H);
  return { canvas, ctx: canvas.getContext('2d') };
};

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  depth: number;
}

/** A burst from a point (dust, crumbs), repeatable for a seed. */
export const burst = (seed: number, count: number, x: number, y: number, speed: number, size: [number, number]): Particle[] => {
  const rnd = seeded(seed);
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.6;
    const v = speed * (0.35 + rnd() * 0.65);
    return { x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, r: size[0] + rnd() * (size[1] - size[0]), life: 0.8 + rnd() * 1.2, depth: rnd() };
  });
};

/** Draws a burst `age` seconds after it started: gravity, drag, fade out. */
export const drawBurst = (ctx: SKRSContext2D, particles: Particle[], age: number, color: string, gravity = 900) => {
  if (age < 0) return;
  ctx.save();
  ctx.fillStyle = color;
  for (const p of particles) {
    if (age > p.life) continue;
    const drag = (1 - Math.exp(-2.2 * age)) / 2.2;
    const x = p.x + p.vx * drag;
    const y = p.y + p.vy * drag + 0.5 * gravity * age * age * (0.3 + p.depth * 0.7);
    ctx.globalAlpha = (1 - age / p.life) * (0.5 + p.depth * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, p.r * (0.6 + p.depth * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/** Soft out-of-focus lights drifting at different depths (parallax). */
export const bokeh = (seed: number, count: number) => {
  const rnd = seeded(seed);
  return Array.from({ length: count }, () => ({ x: rnd() * W, y: rnd() * H, r: 20 + rnd() * 90, depth: rnd(), phase: rnd() * Math.PI * 2 }));
};

export const drawBokeh = (ctx: SKRSContext2D, lights: ReturnType<typeof bokeh>, t: number, color: string, alpha = 0.18, drift = 40) => {
  ctx.save();
  for (const b of lights) {
    const y = ((b.y - t * drift * (0.3 + b.depth) + H * 4) % (H + 200)) - 100;
    const x = b.x + Math.sin(t * 0.6 + b.phase) * 20 * b.depth;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.4 + b.depth * 0.6);
    ctx.fillStyle = g;
    ctx.fillRect(x - b.r, y - b.r, b.r * 2, b.r * 2);
  }
  ctx.restore();
};

/** The biggest font size (up to `max`) that fits `text` in `width`. */
export const fitSize = (ctx: SKRSContext2D, text: string, font: string, width: number, max: number) => {
  let size = max;
  ctx.font = `${size}px "${font}"`;
  while (size > 20 && ctx.measureText(text).width > width) {
    size -= 4;
    ctx.font = `${size}px "${font}"`;
  }
  return size;
};

/** Text with a soft shadow, so it stays readable over photos. */
export const shadowText = (ctx: SKRSContext2D, text: string, x: number, y: number, color: string, blur = 24) => {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
};

/** A rounded rectangle path. */
export const roundRect = (ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Size to fit an image inside a box, keeping its shape. */
export const fitInside = (img: Image, maxW: number, maxH: number) => {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * s, h: img.height * s };
};
