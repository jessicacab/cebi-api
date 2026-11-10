/**
 * The ffmpeg recipes for Studio's video polish. Pure strings, so they are
 * easy to test. Polish never changes what was filmed: it only frames it for
 * phones, adjusts color and adds subtitles.
 */

export const VIDEO_LOOKS = ['natural', 'bright', 'warm'] as const;
export type VideoLook = (typeof VIDEO_LOOKS)[number];
export const VIDEO_FITS = ['fill', 'blur'] as const;
export type VideoFit = (typeof VIDEO_FITS)[number];

/** Vertical 9:16, the size TikTok, Reels and Shorts want. */
export const OUT_W = 1080;
export const OUT_H = 1920;

const LOOKS: Record<VideoLook, string> = {
  natural: 'eq=contrast=1.04:saturation=1.06',
  bright: 'eq=brightness=0.04:contrast=1.08:saturation=1.15',
  warm: 'colorbalance=rs=0.05:gs=0.01:bs=-0.05,eq=contrast=1.04:saturation=1.1',
};

/** White text on a soft dark box, low on the screen, readable on phones. */
export const SUBTITLE_STYLE =
  "FontName=Arial,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=70,Alignment=2";

/** Escapes a file path for ffmpeg's filter syntax. */
const filterPath = (path: string) => path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/**
 * The filter graph: fit to 9:16 (crop to fill, or the whole frame over a
 * blurred copy), then the look, then subtitles when there are some. Output
 * label is [out].
 */
export const polishFilter = (opts: { fit: VideoFit; look: VideoLook; srtPath?: string }) => {
  const framed =
    opts.fit === 'fill'
      ? `[0:v:0]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1[framed]`
      : `[0:v:0]split[a][b];[a]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=20:2[bg];` +
        `[b]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[framed]`;
  const subs = opts.srtPath ? `,subtitles='${filterPath(opts.srtPath)}':force_style='${SUBTITLE_STYLE}'` : '';
  return `${framed};[framed]${LOOKS[opts.look]}${subs}[out]`;
};

/** A photo framed to 720x1280 for the AI clip (the size Sora expects), over a blurred copy. */
export const animateFrameFilter = () =>
  '[0:v:0]split[a][b];[a]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:2[bg];' +
  '[b]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[out]';

/** "Duration: 00:01:02.50" from ffmpeg's output, in seconds. Null when it isn't there. */
export const parseDuration = (ffmpegOutput: string): number | null => {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ffmpegOutput);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

/**
 * Which sound track to use, as an ffmpeg map ("0:a:1"), from ffmpeg's track
 * list. Newer iPhones put a spatial audio track (APAC) first that ffmpeg
 * can't decode ("Audio: none"); use the first one it can, preferring the
 * default. Null when there is no usable sound.
 */
export const pickAudioTrack = (ffmpegOutput: string): string | null => {
  const tracks = [...ffmpegOutput.matchAll(/Stream #0:\d+\S*: Audio: (\S+)[^\n]*/g)].map((m, i) => ({
    i,
    ok: m[1] !== 'none',
    isDefault: m[0].includes('(default)'),
  }));
  const usable = tracks.filter((t) => t.ok);
  const pick = usable.find((t) => t.isDefault) ?? usable[0];
  return pick ? `0:a:${pick.i}` : null;
};
