import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { apiError } from '../../common/errors.js';
import type { Env } from '../../config/env.js';
import type { MediaJob, User } from '../../generated/prisma/client.js';
import { VideoTools } from '../../integrations/media/video-tools.js';
import { AiClient } from '../../integrations/openai/ai-client.js';
import { AiUsage } from '../../integrations/openai/ai-usage.js';
import { FileStorage } from '../../integrations/supabase/file-storage.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { animatePrompt, CLIP_MOTIONS } from './animate.js';
import type { AnimateDto, PolishDto } from './dto/video.dto.js';
import { levelFor } from './enhance.js';
import { findMyPiece } from './studio-pieces.js';

/** A video upload kept on the API's disk while it is processed (multer disk storage). */
export interface UploadedVideo {
  path: string;
  mimetype: string;
  size: number;
}

export const VIDEO_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
/** Longer than any job should take (AI clips wait up to 10 minutes). */
const STUCK_AFTER_MS = 15 * 60 * 1000;

/** What the app sees about a job. */
export const toView = (j: MediaJob) => ({
  id: j.id,
  kind: j.kind,
  status: j.status,
  outputUrl: j.outputUrl,
  inputUrl: j.inputUrl,
  error: j.error,
  // AI clips must be labelled; polish keeps what was filmed; moving ads are edited (no AI generation).
  label: j.kind === 'ANIMATE' ? 'AI-generated' : j.kind === 'MOTION' ? 'Edited' : null,
  // Moving ads: the 3 variations and the one picked.
  variants: j.variants ?? null,
  picked: ((j.options ?? {}) as { picked?: string }).picked ?? null,
  createdAt: j.createdAt,
});

/**
 * Studio video: polish a creator's own video (9:16, color, subtitles from
 * their voice; nothing generated) and "Animate a photo" (a short AI clip from
 * a real product photo). Both run in the background as media jobs.
 * In process: fine for one API machine; move to a queue with several.
 */
@Injectable()
export class StudioVideoService implements OnModuleInit {
  private readonly logger = new Logger('StudioVideo');
  private readonly maxSeconds: number;
  /** Development only: the technical reason goes to the app, and failed uploads are kept to try again. */
  private readonly debug: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly usage: AiUsage,
    private readonly storage: FileStorage,
    private readonly video: VideoTools,
    config: ConfigService<Env, true>,
  ) {
    this.maxSeconds = config.get('VIDEO_MAX_SECONDS', { infer: true });
    this.debug = config.get('NODE_ENV', { infer: true }) === 'development';
  }

  /**
   * Jobs stuck for over 15 minutes can't finish (the API stopped while they
   * ran). Mark them failed instead of letting the app wait forever. Never
   * blocks start-up (for example before the migration is applied).
   */
  async onModuleInit() {
    await this.failStuckJobs().catch((error) => this.logger.warn(`Could not check stuck video jobs: ${String(error)}`));
  }

  private failStuckJobs(userId?: string) {
    return this.prisma.mediaJob.updateMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] }, updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) }, ...(userId && { userId }) },
      data: { status: 'FAILED', error: 'This took too long or the server restarted. Please try again.' },
    });
  }

  /** Runs the work after the request returns; the job records how it went. */
  private runInBackground(jobId: string, work: () => Promise<string>, cleanup?: () => Promise<void>, input?: string) {
    void (async () => {
      try {
        await this.prisma.mediaJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
        const outputUrl = await work();
        await this.prisma.mediaJob.update({ where: { id: jobId }, data: { status: 'DONE', outputUrl } });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const friendly =
          error instanceof Error && 'getResponse' in error ? error.message : 'Something went wrong with this video. Please try again.';
        const message = this.debug && friendly !== detail ? `${friendly} [dev: ${detail.slice(-400)}]` : friendly;
        this.logger.warn(`Job ${jobId} failed: ${detail}`);
        if (this.debug && input) await this.keepFailedInput(jobId, input);
        await this.prisma.mediaJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: message } }).catch(() => undefined);
      } finally {
        await cleanup?.().catch(() => undefined);
      }
    })();
  }

  /** Development only: keeps a failed upload in tmp/failed-videos so it can be tried again by hand. */
  private async keepFailedInput(jobId: string, path: string) {
    const dir = join(process.cwd(), 'tmp', 'failed-videos');
    await mkdir(dir, { recursive: true })
      .then(() => copyFile(path, join(dir, `${jobId}.video`)))
      .then(() => this.logger.warn(`Kept the failed upload at tmp/failed-videos/${jobId}.video`))
      .catch(() => undefined);
  }

  /** Polish the creator's own video for a piece. The file is deleted once done. */
  async polish(creator: User, dto: PolishDto, file?: UploadedVideo) {
    const removeUpload = () => (file ? rm(file.path, { force: true }) : Promise.resolve());
    try {
      if (!file) throw new BadRequestException(['file is required']);
      if (!file.mimetype.startsWith('video/')) throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', 'Use a video file.');
      await findMyPiece(this.prisma, creator, dto.pieceId);
      const seconds = await this.video.durationSeconds(file.path).catch(() => {
        throw apiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE', "Cebi couldn't read that video.");
      });
      if (seconds > this.maxSeconds) {
        throw apiError(HttpStatus.BAD_REQUEST, 'VIDEO_TOO_LONG', `Videos can be up to ${this.maxSeconds} seconds for now.`);
      }
      // Subtitles need AI (speech to text); without it the rest still works.
      const subtitles = dto.subtitles !== false && this.ai.enabled;
      if (subtitles) this.usage.take(creator.id);
      const job = await this.prisma.mediaJob.create({
        data: { userId: creator.id, pieceId: dto.pieceId, kind: 'POLISH', options: { look: dto.look, fit: dto.fit, subtitles } },
      });
      this.runInBackground(
        job.id,
        async () => {
          let srt: string | undefined;
          if (subtitles) {
            const audio = await this.video.extractAudio(file.path);
            srt = audio ? (await this.ai.transcribeSrt(audio, 'audio.m4a')) || undefined : undefined;
          }
          const mp4 = await this.video.polish(file.path, { fit: dto.fit ?? 'fill', look: dto.look ?? 'natural', srt });
          return this.storage.upload(`videos/${creator.id}/${job.id}.mp4`, mp4, 'video/mp4');
        },
        removeUpload,
        file.path,
      );
      return toView(job);
    } catch (error) {
      await removeUpload();
      throw error;
    }
  }

  /** A short AI clip from a real photo the creator saved or enhanced for this piece. */
  async animate(creator: User, dto: AnimateDto) {
    if (!this.ai.enabled) throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'AI_NOT_CONFIGURED', 'AI features are not set up yet.');
    const piece = await findMyPiece(this.prisma, creator, dto.pieceId);
    if (levelFor(piece.campaign.contentType.slug) !== 'full') {
      throw apiError(HttpStatus.FORBIDDEN, 'ANIMATE_NOT_ALLOWED', 'AI clips are only for ad-style campaigns (UGC, affiliate, product review).');
    }
    const ownPhoto = dto.imageUrl.includes(`/enhance/${creator.id}/`) || dto.imageUrl.includes(`/pieces/${piece.id}/`);
    if (!this.storage.isOurs(dto.imageUrl) || !ownPhoto) {
      throw new BadRequestException(['imageUrl must be a photo you added or enhanced in Cebi']);
    }
    const motion = CLIP_MOTIONS.find((m) => m.id === dto.motion)!;
    this.usage.take(creator.id, 'video');
    const job = await this.prisma.mediaJob.create({
      data: { userId: creator.id, pieceId: piece.id, kind: 'ANIMATE', inputUrl: dto.imageUrl, options: { motion: motion.id, seconds: dto.seconds ?? '4' } },
    });
    this.runInBackground(job.id, async () => {
      const photo = await this.video.frameForClip(await this.storage.download(dto.imageUrl));
      const clip = await this.ai.generateVideo({ image: photo, prompt: animatePrompt(motion), seconds: dto.seconds ?? '4', userId: creator.id });
      return this.storage.upload(`videos/${creator.id}/${job.id}-ai.mp4`, clip, 'video/mp4');
    });
    return toView(job);
  }

  /** One of my jobs. */
  async job(user: User, id: string) {
    await this.failStuckJobs(user.id);
    const job = await this.prisma.mediaJob.findFirst({ where: { id, userId: user.id } });
    if (!job) throw new NotFoundException('Not found');
    return toView(job);
  }
}
