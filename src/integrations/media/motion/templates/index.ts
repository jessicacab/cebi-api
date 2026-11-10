import type { MotionTemplate } from '../types.js';
import { boxTour } from './box-tour.js';
import { heroReveal } from './hero-reveal.js';
import { typeBehind } from './type-behind.js';

export const MOTION_TEMPLATES: Record<string, MotionTemplate> = {
  [heroReveal.id]: heroReveal,
  [boxTour.id]: boxTour,
  [typeBehind.id]: typeBehind,
};

/** The 3 variations, A, B and C: different concepts, never the same template twice. */
export const MOTION_SET = [
  { key: 'A', template: heroReveal.id, name: 'Hero reveal', description: 'Energetic: the product flies in, big words, end card' },
  { key: 'B', template: boxTour.id, name: 'Photo tour', description: 'Rhythmic: quick swipes across your real photo' },
  { key: 'C', template: typeBehind.id, name: 'Type behind', description: 'Calm and premium: huge words behind the product' },
] as const;
