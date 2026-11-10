import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { animateFrameFilter, parseDuration, pickAudioTrack, polishFilter, type VideoFit, type VideoLook } from './video-filters.js';

/**
 * Video work on the API's machine (ffmpeg). Tests swap in a fake, so they
 * don't need ffmpeg or real videos.
 */
export abstract class VideoTools {
  /** Length of a video file, in seconds. */
  abstract durationSeconds(path: string): Promise<number>;
  /** The sound as a small mono M4A, for subtitles. Null when the video has no sound. */
  abstract extractAudio(path: string): Promise<Buffer | null>;
  /** The polished MP4: 9:16, the look, subtitles when given. */
  abstract polish(path: string, opts: { fit: VideoFit; look: VideoLook; srt?: string }): Promise<Buffer>;
  /** A photo framed to 720x1280 JPEG for the AI clip. */
  abstract frameForClip(image: Buffer): Promise<Buffer>;
}

/** Runs ffmpeg and returns what it printed; rejects when it fails. */
const ffmpeg = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg is not installed'));
    const child = spawn(ffmpegPath as unknown as string, ['-hide_banner', '-y', ...args]);
    let log = '';
    child.stderr.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-20_000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(log) : reject(new Error(`ffmpeg exited ${code}: ${log.slice(-500)}`))));
  });

/** A temporary folder that is always cleaned up. */
const withTemp = async <T>(fn: (dir: string) => Promise<T>) => {
  const dir = await mkdtemp(join(tmpdir(), 'cebi-video-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

@Injectable()
export class FfmpegVideoTools extends VideoTools {
  /** ffmpeg's description of the file (length and tracks). Reads only the main picture, without writing a file. */
  private probe(path: string) {
    return ffmpeg(['-i', path, '-map', '0:v:0', '-t', '0.1', '-f', 'null', '-']);
  }

  async durationSeconds(path: string): Promise<number> {
    const seconds = parseDuration(await this.probe(path));
    if (seconds === null) throw new Error('could not read the video length');
    return seconds;
  }

  async extractAudio(path: string): Promise<Buffer | null> {
    return withTemp(async (dir) => {
      const out = join(dir, 'audio.m4a');
      const audio = pickAudioTrack(await this.probe(path));
      if (!audio) return null; // no usable sound
      try {
        await ffmpeg(['-i', path, '-map', audio, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k', out]);
      } catch {
        return null;
      }
      return readFile(out);
    });
  }

  async polish(path: string, opts: { fit: VideoFit; look: VideoLook; srt?: string }): Promise<Buffer> {
    return withTemp(async (dir) => {
      const srtPath = opts.srt ? join(dir, 'subs.srt') : undefined;
      if (srtPath) await writeFile(srtPath, opts.srt!);
      const out = join(dir, 'polished.mp4');
      const audio = pickAudioTrack(await this.probe(path));
      await ffmpeg([
        '-i', path,
        '-filter_complex', polishFilter({ fit: opts.fit, look: opts.look, srtPath }),
        // One sound track ffmpeg can decode: newer iPhones put an undecodable
        // spatial audio track (APAC) first, and mapping it fails the whole job.
        '-map', '[out]', ...(audio ? ['-map', audio] : []),
        // H.264 + AAC that every phone plays; capped bitrate keeps files under the storage limit.
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-dn', '-sn', '-movflags', '+faststart',
        out,
      ]);
      return readFile(out);
    });
  }

  async frameForClip(image: Buffer): Promise<Buffer> {
    return withTemp(async (dir) => {
      const input = join(dir, 'in.jpg');
      const out = join(dir, 'framed.jpg');
      await writeFile(input, image);
      await ffmpeg(['-i', input, '-filter_complex', animateFrameFilter(), '-map', '[out]', '-q:v', '3', out]);
      return readFile(out);
    });
  }
}
