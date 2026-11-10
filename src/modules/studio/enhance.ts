/**
 * Enhance: AI polish on a real photo. The real product always stays as it is;
 * the AI only changes what is around it. How far it may go depends on the
 * campaign type (see the cebi-studio skill).
 */

/** full: new scene, light and effects. light: light and color only, nothing added or removed. */
export type EnhanceLevel = 'full' | 'light';

/** Content types that are ad material, so a polished product shot is the point. */
export const FULL_ENHANCE_TYPES = ['ugc', 'affiliate', 'product-review'];

export const levelFor = (contentTypeSlug: string | null | undefined): EnhanceLevel =>
  contentTypeSlug && FULL_ENHANCE_TYPES.includes(contentTypeSlug) ? 'full' : 'light';

export interface EnhanceStyle {
  id: string;
  name: string;
  description: string;
  level: EnhanceLevel;
  scene: string;
}

export const ENHANCE_STYLES: EnhanceStyle[] = [
  {
    id: 'light-fix',
    name: 'Better light',
    description: 'Brighter, sharper, true colors',
    level: 'light',
    scene: 'Only improve exposure, white balance, contrast and sharpness so it looks like a well lit photo of the same moment.',
  },
  {
    id: 'studio-splash',
    name: 'Studio splash',
    description: 'Bold color backdrop with a dynamic splash',
    level: 'full',
    scene: 'Studio advertising shot: a bold, rich solid color backdrop that suits the product, dramatic rim lighting, and a dynamic splash or burst that fits what the product is.',
  },
  {
    id: 'clean-white',
    name: 'Clean white',
    description: 'Bright white background, soft shadow',
    level: 'full',
    scene: 'Clean e-commerce shot on a seamless white background with soft, even studio light and a gentle natural shadow.',
  },
  {
    id: 'lifestyle-table',
    name: 'Lifestyle table',
    description: 'Warm table setting, natural light',
    level: 'full',
    scene: 'Lifestyle shot on a tasteful table in warm natural window light, with a softly blurred background and a few simple props that suit the product.',
  },
  {
    id: 'bold-color',
    name: 'Bold color',
    description: 'Bright pop colors, playful',
    level: 'full',
    scene: 'Playful pop-art style backdrop in bright complementary colors with crisp shadows, eye-catching for social media.',
  },
];

/** The styles allowed at a level: light gets only the light fix; full gets everything. */
export const stylesFor = (level: EnhanceLevel) => ENHANCE_STYLES.filter((s) => level === 'full' || s.level === 'light');

/** The rules every edit follows, then the style. */
export const enhancePrompt = (style: EnhanceStyle) =>
  [
    'Edit this real photo for a social media campaign.',
    'Keep the main product or dish exactly as it is: same shape, size, colors, label, logo, text and every detail. Do not add, remove or change anything on the product.',
    'Do not add any text, words, logos, watermarks or people.',
    style.level === 'light' ? 'Do not change the background or the scene; keep everything that is in the photo.' : '',
    style.scene,
    'Photorealistic, high quality.',
  ]
    .filter(Boolean)
    .join(' ');

/** Portrait for posts and Stories, landscape for campaign covers. */
export const sizeFor = (purpose: 'post' | 'cover'): '1024x1536' | '1536x1024' => (purpose === 'cover' ? '1536x1024' : '1024x1536');
