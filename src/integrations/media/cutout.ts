import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The product cut out of a photo: the original pixels, with a clear background. */
export interface CutoutResult {
  /** PNG, cropped to the product. */
  png: Buffer;
  /** Where the product sits in the original photo (pixels). */
  box: { x: number; y: number; width: number; height: number };
  /** Share of the photo the product covers (0 to 1). Tiny or near-full means the cut-out is not useful. */
  coverage: number;
}

/**
 * Cuts the main product out of a photo, for motion templates (the product can
 * move above the background). The model only makes a mask; the mask is applied
 * to the original pixels, so the product is never redrawn. Tests use a fake.
 */
export abstract class Cutout {
  /** Null when no clear product was found. */
  abstract cut(image: Buffer): Promise<CutoutResult | null>;
}

/** ISNet (general use), Apache 2.0, from the rembg project's model files. Checked by SHA-256. */
const MODEL = {
  file: 'isnet-general-use.onnx',
  url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
  sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
  size: 1024,
};

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Box around mask values above the threshold, plus the share of pixels inside. */
export const maskBox = (mask: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 128) => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] >= threshold) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, coverage: count / (width * height) };
};

@Injectable()
export class OnnxCutout extends Cutout {
  private readonly logger = new Logger('Cutout');
  private session: Promise<import('onnxruntime-node').InferenceSession> | null = null;

  constructor(private readonly modelsDir = join(process.cwd(), '.cache', 'models')) {
    super();
  }

  /** Downloads the model once (about 180 MB) and refuses it if the checksum differs. */
  private async modelPath() {
    const path = join(this.modelsDir, MODEL.file);
    if (existsSync(path)) return path;
    await mkdir(this.modelsDir, { recursive: true });
    this.logger.log(`Downloading the cut-out model to ${path}`);
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`model download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== MODEL.sha256) throw new Error('model checksum does not match');
    await writeFile(`${path}.part`, buf);
    await rename(`${path}.part`, path);
    return path;
  }

  private load() {
    this.session ??= (async () => {
      const ort = await import('onnxruntime-node');
      const path = await this.modelPath();
      if (sha256(await readFile(path)) !== MODEL.sha256) throw new Error('model checksum does not match');
      return ort.InferenceSession.create(path);
    })().catch((error) => {
      this.session = null;
      throw error;
    });
    return this.session;
  }

  /** The model's mask (0 to 255) at the photo's size. */
  private async mask(img: Image): Promise<Uint8ClampedArray> {
    const ort = await import('onnxruntime-node');
    const session = await this.load();
    const S = MODEL.size;
    const small = createCanvas(S, S).getContext('2d');
    small.drawImage(img, 0, 0, S, S);
    const px = small.getImageData(0, 0, S, S).data;
    // ISNet input: RGB scaled to 0..1, minus 0.5, channels first.
    const input = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) {
      input[i] = px[i * 4] / 255 - 0.5;
      input[S * S + i] = px[i * 4 + 1] / 255 - 0.5;
      input[2 * S * S + i] = px[i * 4 + 2] / 255 - 0.5;
    }
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
    const pred = out[session.outputNames[0]].data as Float32Array;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < S * S; i++) {
      lo = Math.min(lo, pred[i]);
      hi = Math.max(hi, pred[i]);
    }
    const maskSmall = createCanvas(S, S);
    const mctx = maskSmall.getContext('2d');
    const data = mctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.round(((pred[i] - lo) / Math.max(hi - lo, 1e-6)) * 255);
      data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
      data.data[i * 4 + 3] = v;
    }
    mctx.putImageData(data, 0, 0);
    // Scale the mask to the photo, smoothly.
    const full = createCanvas(img.width, img.height).getContext('2d');
    full.drawImage(maskSmall, 0, 0, img.width, img.height);
    const alpha = full.getImageData(0, 0, img.width, img.height).data;
    const mask = new Uint8ClampedArray(img.width * img.height);
    for (let i = 0; i < mask.length; i++) mask[i] = alpha[i * 4 + 3];
    return mask;
  }

  async cut(image: Buffer): Promise<CutoutResult | null> {
    const img = await loadImage(image);
    const mask = await this.mask(img);
    const box = maskBox(mask, img.width, img.height);
    // Nothing found, or the "product" is basically the whole photo.
    if (!box || box.coverage < 0.03 || box.coverage > 0.92) return null;

    // Original pixels, with the mask as transparency.
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    for (let i = 0; i < mask.length; i++) pixels.data[i * 4 + 3] = mask[i];
    ctx.putImageData(pixels, 0, 0);

    const crop = createCanvas(box.width, box.height);
    crop.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return {
      png: await crop.encode('png'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      coverage: box.coverage,
    };
  }
}
