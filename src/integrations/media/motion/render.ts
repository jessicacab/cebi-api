import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { registerFonts } from './kit.js';
import { FPS, H, W, type MotionInput, type MotionTemplate } from './types.js';

/** Sub-frames per frame on fast moves, over half a frame (a 180 degree shutter). */
const BLUR_SAMPLES = 6;
const SHUTTER = 0.5;

/**
 * Paints one frame. On fast moves it averages several moments inside the
 * shutter, which is real motion blur rather than a blur filter.
 */
const frameAt = (template: MotionTemplate, paint: ReturnType<MotionTemplate['prepare']>) => {
  const frame = createCanvas(W, H);
  const fctx = frame.getContext('2d');
  const sample = createCanvas(W, H);
  const sctx = sample.getContext('2d');
  return (t: number) => {
    if (!template.blurAt(t)) {
      fctx.globalAlpha = 1;
      paint(fctx, t);
      return frame;
    }
    for (let i = 0; i < BLUR_SAMPLES; i++) {
      const st = t + ((i / (BLUR_SAMPLES - 1) - 0.5) * SHUTTER) / FPS;
      sctx.globalAlpha = 1;
      paint(sctx, st);
      // Running average: each new sample weighs 1 / (i + 1).
      fctx.globalAlpha = 1 / (i + 1);
      fctx.drawImage(sample, 0, 0);
    }
    fctx.globalAlpha = 1;
    return frame;
  };
};

/** Renders a template to an H.264 MP4 (1080x1920, 30 fps), the same output rules as polish. */
export const renderVideo = async (template: MotionTemplate, input: MotionInput): Promise<Buffer> => {
  if (!ffmpegPath) throw new Error('ffmpeg is not installed');
  registerFonts();
  const paint = template.prepare(input);
  const at = frameAt(template, paint);
  const dir = await mkdtemp(join(tmpdir(), 'cebi-motion-'));
  const out = join(dir, 'motion.mp4');
  try {
    const child = spawn(ffmpegPath as unknown as string, [
      '-hide_banner', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M',
      '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', out,
    ]);
    let log = '';
    child.stderr.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-4000)));
    const closed = once(child, 'close');
    const frames = Math.round(template.duration * FPS);
    for (let f = 0; f < frames; f++) {
      const canvas = at(f / FPS);
      const raw = canvas.getContext('2d').getImageData(0, 0, W, H).data;
      if (!child.stdin.write(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength))) await once(child.stdin, 'drain');
    }
    child.stdin.end();
    const [code] = (await closed) as [number];
    if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${log.slice(-500)}`);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Four moments (hook, build, hero, end card) side by side, so people can choose before the videos finish. */
export const renderStoryboard = async (template: MotionTemplate, input: MotionInput): Promise<Buffer> => {
  registerFonts();
  const paint = template.prepare(input);
  const at = frameAt(template, paint);
  const tw = 270;
  const th = 480;
  const gap = 12;
  const board = createCanvas(tw * 4 + gap * 5, th + gap * 2);
  const ctx = board.getContext('2d');
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, board.width, board.height);
  template.storyboard.forEach((t, i) => ctx.drawImage(at(t), gap + i * (tw + gap), gap, tw, th));
  return board.encode('jpeg', 88);
};
