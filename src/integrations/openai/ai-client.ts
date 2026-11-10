import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import OpenAI, { toFile } from 'openai';
import { apiError } from '../../common/errors.js';
import type { Env } from '../../config/env.js';

export interface AiJsonRequest {
  /** What the model is and the rules it follows. */
  system: string;
  /** The task and the data, as text. */
  user: string;
  /** Short label for the output shape, e.g. "suggestions". */
  name: string;
  /** JSON Schema of the answer (strict: every property required, no extras). */
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}

export interface AiImageEditRequest {
  /** The real photo to start from. */
  image: Buffer;
  mimeType: string;
  prompt: string;
  /** How many versions to make. */
  n: number;
  size: '1024x1536' | '1536x1024' | '1024x1024';
  /** Our user id; hashed before it is sent, for OpenAI's abuse checks. */
  userId: string;
}

export interface AiVideoRequest {
  /** The real photo the clip starts from, already 720x1280 JPEG. */
  image: Buffer;
  prompt: string;
  seconds: '4' | '8';
  userId: string;
}

/**
 * The AI model behind Cebi's AI features. OpenAI in the app; tests swap in a
 * fake so they never call OpenAI. Returns the parsed JSON answer; callers
 * still check its shape.
 */
export abstract class AiClient {
  /** False when no key is set: callers fall back or answer AI_NOT_CONFIGURED. */
  abstract readonly enabled: boolean;
  abstract json(request: AiJsonRequest): Promise<unknown>;
  /** Edits a real photo (Enhance). Returns JPEG images. */
  abstract editImage(request: AiImageEditRequest): Promise<Buffer[]>;
  /** Speech to subtitles (SRT text). Empty when nobody speaks. */
  abstract transcribeSrt(audio: Buffer, fileName: string): Promise<string>;
  /** A short clip from a real photo ("Animate a photo"). Returns MP4. Slow: minutes. */
  abstract generateVideo(request: AiVideoRequest): Promise<Buffer>;
}

/** OpenAI Responses API with Structured Outputs (strict JSON Schema). */
@Injectable()
export class OpenAiClient extends AiClient {
  private readonly logger = new Logger('AI');
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly imageModel: string;
  private readonly videoModel: string;
  private readonly transcribeModel: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const key = config.get('OPENAI_API_KEY', { infer: true });
    this.model = config.get('OPENAI_MODEL', { infer: true });
    this.imageModel = config.get('OPENAI_IMAGE_MODEL', { infer: true });
    this.videoModel = config.get('OPENAI_VIDEO_MODEL', { infer: true });
    this.transcribeModel = config.get('OPENAI_TRANSCRIBE_MODEL', { infer: true });
    // One quick retry, and never let a stuck call hold a screen for long.
    // Image edits take longer, so they get their own timeout per call.
    this.client = key ? new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 1 }) : null;
  }

  get enabled() {
    return !!this.client;
  }

  async json(request: AiJsonRequest): Promise<unknown> {
    if (!this.client) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI features are not set up yet.');
    }
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        text: { format: { type: 'json_schema', name: request.name, schema: request.schema, strict: true } },
        max_output_tokens: request.maxOutputTokens ?? 800,
      });
      if (response.status === 'incomplete' || !response.output_text) {
        throw new Error(`incomplete answer (${response.incomplete_details?.reason ?? 'empty'})`);
      }
      return JSON.parse(response.output_text);
    } catch (error) {
      this.logger.warn(`AI call "${request.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
      throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't answer right now. Please try again.");
    }
  }

  async editImage(request: AiImageEditRequest): Promise<Buffer[]> {
    if (!this.client) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI features are not set up yet.');
    }
    try {
      const result = await this.client.images.edit(
        {
          model: this.imageModel,
          image: await toFile(request.image, 'photo', { type: request.mimeType }),
          prompt: request.prompt,
          n: request.n,
          size: request.size,
          quality: 'medium',
          output_format: 'jpeg',
          output_compression: 85,
          safety_identifier: createHash('sha256').update(request.userId).digest('hex'),
        },
        { timeout: 120_000 },
      );
      const images = (result.data ?? []).flatMap((d) => (d.b64_json ? [Buffer.from(d.b64_json, 'base64')] : []));
      if (!images.length) throw new Error('no images returned');
      return images;
    } catch (error) {
      this.logger.warn(`AI image edit failed: ${error instanceof Error ? error.message : String(error)}`);
      throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't enhance this photo right now. Please try again.");
    }
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI features are not set up yet.');
    }
    return this.client;
  }

  async transcribeSrt(audio: Buffer, fileName: string): Promise<string> {
    const client = this.requireClient();
    try {
      const srt = await client.audio.transcriptions.create(
        { model: this.transcribeModel, file: await toFile(audio, fileName, { type: 'audio/mp4' }), response_format: 'srt' },
        { timeout: 120_000 },
      );
      return typeof srt === 'string' ? srt.trim() : '';
    } catch (error) {
      this.logger.warn(`AI transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't make subtitles right now.");
    }
  }

  async generateVideo(request: AiVideoRequest): Promise<Buffer> {
    const client = this.requireClient();
    try {
      let video = await client.videos.create({
        model: this.videoModel,
        prompt: request.prompt,
        input_reference: await toFile(request.image, 'photo.jpg', { type: 'image/jpeg' }),
        seconds: request.seconds,
        size: '720x1280',
      });
      // Video generation runs on OpenAI's side; check every 10 seconds, give up after 10 minutes.
      const until = Date.now() + 10 * 60 * 1000;
      while (video.status === 'queued' || video.status === 'in_progress') {
        if (Date.now() > until) throw new Error('timed out');
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        video = await client.videos.retrieve(video.id);
      }
      if (video.status !== 'completed') throw new Error(`status ${video.status}`);
      const content = await client.videos.downloadContent(video.id);
      return Buffer.from(await content.arrayBuffer());
    } catch (error) {
      this.logger.warn(`AI video failed: ${error instanceof Error ? error.message : String(error)}`);
      throw apiError(HttpStatus.BAD_GATEWAY, 'AI_UNAVAILABLE', "AI couldn't make the clip right now. Please try again.");
    }
  }
}
