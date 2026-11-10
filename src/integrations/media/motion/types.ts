import type { Image, SKRSContext2D } from '@napi-rs/canvas';

/** 9:16 at 30 fps, the size TikTok, Reels and Shorts want. */
export const W = 1080;
export const H = 1920;
export const FPS = 30;

/** Keep text and logos out of the platform buttons and captions (TikTok, Reels). */
export const SAFE = { top: 220, bottom: H - 420, left: 60, right: W - 130 } as const;
/** Horizontal center of the safe area (a little left of the frame's center). */
export const SAFE_CX = (SAFE.left + SAFE.right) / 2;

/** Colors taken from the photo, so one grade runs through the clip. */
export interface Palette {
  /** Deep background color. */
  deep: string;
  /** A warmer, lighter tone of the background. */
  glow: string;
  /** The photo's most vivid color, for highlights and the CTA. */
  accent: string;
  /** Text on dark backgrounds. */
  ink: string;
}

/** Everything a template may show. Words come from the campaign, never from AI. */
export interface MotionInput {
  /** The real photo (pixels never changed, only placed and scaled). */
  photo: Image;
  /** The product cut out of the photo (original pixels), when found. */
  cutout: Image | null;
  /** Where the product sits in the photo (pixels), when the cut-out found it. */
  productBox?: { x: number; y: number; width: number; height: number } | null;
  /** 2 to 4 short words from the brief, shown one at a time. */
  words: string[];
  business: { name: string; logo: Image | null };
  /** Offer, code or hashtag from the brief, for the end card. */
  cta?: string;
  /** "@handle" from the brief, for the end card. */
  handle?: string;
  palette: Palette;
}

/** One motion design. `draw` paints frame time `t` (seconds) on a W x H canvas. */
export interface MotionTemplate {
  id: string;
  /** Seconds. */
  duration: number;
  /** Times for the 4-frame storyboard: hook, build, hero, end card. */
  storyboard: [number, number, number, number];
  /** True where moves are fast enough to need motion blur. */
  blurAt: (t: number) => boolean;
  /** Called once before rendering; returns the frame painter. */
  prepare: (input: MotionInput) => (ctx: SKRSContext2D, t: number) => void;
}
