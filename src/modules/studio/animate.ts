/**
 * "Animate a photo": a short AI clip made from a real product photo. Same
 * rules as Enhance (cebi-studio skill): the product stays exactly as it is,
 * no AI text, logos or people, labelled AI-generated, and only for ad-style
 * campaigns (full level).
 */

export interface ClipMotion {
  id: string;
  name: string;
  description: string;
  motion: string;
}

export const CLIP_MOTIONS: ClipMotion[] = [
  {
    id: 'splash',
    name: 'Splash',
    description: 'Liquid splash and droplets in motion',
    motion: 'A dynamic splash of liquid or crumbs that suits the product swirls around it in slow motion, droplets catching the light.',
  },
  {
    id: 'orbit',
    name: 'Slow orbit',
    description: 'Camera glides around with a light sweep',
    motion: 'The camera slowly orbits and pushes in on the product while a soft highlight sweeps across it.',
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    description: 'Soft glow and floating sparkles',
    motion: 'Soft glowing light pulses behind the product and small sparkles float gently around it.',
  },
];

export const animatePrompt = (motion: ClipMotion) =>
  [
    'Animate this exact product photo into a short vertical advertising clip.',
    'Keep the product exactly as it is in every frame: same shape, size, colors, label, logo and text. It must not morph, melt or change.',
    'Do not add any text, words, logos, watermarks or people.',
    motion.motion,
    'Smooth, premium, realistic lighting. No cuts.',
  ].join(' ');

export const CLIP_SECONDS = ['4', '8'] as const;
export type ClipSeconds = (typeof CLIP_SECONDS)[number];
