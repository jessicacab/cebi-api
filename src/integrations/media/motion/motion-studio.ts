import { Injectable } from '@nestjs/common';
import { loadImage } from '@napi-rs/canvas';
import { Cutout } from '../cutout.js';
import { paletteFrom } from './kit.js';
import { renderStoryboard, renderVideo } from './render.js';
import { MOTION_TEMPLATES } from './templates/index.js';
import type { MotionInput } from './types.js';

/** What a moving ad shows. Words come from the campaign or the person, never from AI. */
export interface MotionRequest {
  photo: Buffer;
  /** The business's own logo file, if it uploaded one. */
  logo: Buffer | null;
  words: string[];
  businessName: string;
  cta?: string;
  handle?: string;
}

/** Shared work done once per job (cut-out, palette), reused by every variation. */
export type PreparedMotion = { readonly __prepared: unique symbol };

/**
 * Draws moving ads from a real photo with motion templates (cebi-studio
 * skill, "Motion design"). Tests swap in a fake, so they need no canvas or ffmpeg.
 */
export abstract class MotionStudio {
  abstract prepare(request: MotionRequest): Promise<PreparedMotion>;
  /** Four key moments side by side (JPEG). */
  abstract storyboard(prepared: PreparedMotion, template: string): Promise<Buffer>;
  /** The 1080x1920 MP4. */
  abstract video(prepared: PreparedMotion, template: string): Promise<Buffer>;
}

@Injectable()
export class CanvasMotionStudio extends MotionStudio {
  constructor(private readonly cutout: Cutout) {
    super();
  }

  async prepare(request: MotionRequest): Promise<PreparedMotion> {
    const photo = await loadImage(request.photo);
    // No clear product (or the model can't load): templates use the photo as a card instead.
    const cut = await this.cutout.cut(request.photo).catch(() => null);
    const input: MotionInput = {
      photo,
      cutout: cut ? await loadImage(cut.png) : null,
      productBox: cut?.box ?? null,
      words: request.words,
      business: { name: request.businessName, logo: request.logo ? await loadImage(request.logo).catch(() => null) : null },
      cta: request.cta,
      handle: request.handle,
      palette: paletteFrom(photo),
    };
    return input as unknown as PreparedMotion;
  }

  private template(id: string) {
    const template = MOTION_TEMPLATES[id];
    if (!template) throw new Error(`unknown motion template ${id}`);
    return template;
  }

  storyboard(prepared: PreparedMotion, template: string) {
    return renderStoryboard(this.template(template), prepared as unknown as MotionInput);
  }

  video(prepared: PreparedMotion, template: string) {
    return renderVideo(this.template(template), prepared as unknown as MotionInput);
  }
}
