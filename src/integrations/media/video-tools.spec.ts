import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { parseDuration, pickAudioTrack, polishFilter } from './video-filters.js';
import { FfmpegVideoTools } from './video-tools.js';

describe('video filters', () => {
  it('frames to 9:16 by cropping or over a blurred copy, then the look and subtitles', () => {
    expect(polishFilter({ fit: 'fill', look: 'natural' })).toContain('crop=1080:1920');
    const blur = polishFilter({ fit: 'blur', look: 'warm', srtPath: '/tmp/a b/subs.srt' });
    expect(blur).toContain('boxblur');
    expect(blur).toContain('colorbalance');
    expect(blur).toContain("subtitles='/tmp/a b/subs.srt'");
    expect(parseDuration('  Duration: 00:01:02.50, start: 0')).toBe(62.5);
    expect(parseDuration('nothing')).toBeNull();
  });

  it('skips sound tracks ffmpeg cannot decode (iPhone spatial audio)', () => {
    const iphone = [
      '  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), 1920x1080 (default)',
      '  Stream #0:1[0x2](und): Audio: none (apac / 0x63617061), 48000 Hz, 5 channels, 487 kb/s',
      '  Stream #0:2[0x3](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 126 kb/s (default)',
      '  Stream #0:3[0x4](und): Data: none (mebx / 0x7862656D), 2 kb/s (default)',
    ].join('\n');
    expect(pickAudioTrack(iphone)).toBe('0:a:1');
    expect(pickAudioTrack('  Stream #0:1: Audio: aac (LC), 44100 Hz, mono')).toBe('0:a:0');
    expect(pickAudioTrack('  Stream #0:0: Video: h264')).toBeNull();
  });
});

// Runs the real ffmpeg on a 2 second test video, so a broken install shows up in tests.
const hasFfmpeg = !!ffmpegPath && existsSync(ffmpegPath as unknown as string);
describe.runIf(hasFfmpeg)('ffmpeg polish (real)', () => {
  it('polishes a landscape clip to vertical with subtitles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cebi-test-'));
    try {
      const input = join(dir, 'in.mp4');
      spawnSync(ffmpegPath as unknown as string, [
        '-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=24',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', input,
      ]);
      const tools = new FfmpegVideoTools();
      expect(Math.round(await tools.durationSeconds(input))).toBe(2);
      expect(await tools.extractAudio(input)).toBeInstanceOf(Buffer);
      const out = await tools.polish(input, { fit: 'blur', look: 'bright', srt: '1\n00:00:00,000 --> 00:00:01,500\nHello Cebu\n' });
      const outPath = join(dir, 'out.mp4');
      await (await import('node:fs/promises')).writeFile(outPath, out);
      const probe = spawnSync(ffmpegPath as unknown as string, ['-hide_banner', '-i', outPath]).stderr.toString();
      expect(probe).toContain('1080x1920');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
