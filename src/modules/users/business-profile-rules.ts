import { parseContact } from '../../common/contact.js';

/**
 * Cleaning what businesses type on their profile. Pure functions, so the
 * rules are easy to test. An empty value means "clear it" (null).
 */

export const SOCIAL_KEYS = ['tiktok', 'facebook', 'instagram', 'youtube'] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type Socials = Partial<Record<SocialKey, string>>;

/** Trims; blank becomes null; undefined stays undefined (not sent, not changed). */
export const cleanText = (value: string | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  const v = value.trim().replace(/\s+/g, ' ');
  return v ? v : null;
};

/** A mobile number in E.164 (+639...), or null when blank. Throws on anything else. */
export const cleanMobile = (value: string | undefined): string | null | undefined => {
  const v = cleanText(value);
  if (v == null) return v;
  const contact = parseContact(v);
  if (contact?.channel !== 'sms') throw new Error('mobile');
  return contact.phone;
};

/** Landlines vary a lot ((032) 345 6789, 345-6789 loc. 2); only digits and phone punctuation. */
export const cleanLandline = (value: string | undefined): string | null | undefined => {
  const v = cleanText(value);
  if (v == null) return v;
  if (!/^[+\d\s().-]+(\s*(loc|ext)\.?\s*\d+)?$/i.test(v) || v.replace(/\D/g, '').length < 7) throw new Error('landline');
  return v;
};

/**
 * TikTok, Instagram and YouTube become "@handle" (a pasted profile link works
 * too); Facebook is a page name or link and is kept as typed.
 */
export const cleanHandle = (key: SocialKey, value: string): string | null => {
  const v = value.trim();
  if (!v) return null;
  if (key === 'facebook') return v.slice(0, 100);
  const fromLink = /(?:tiktok\.com|instagram\.com|youtube\.com)\/(?:@)?([A-Za-z0-9._-]+)/i.exec(v)?.[1];
  const handle = (fromLink ?? v).replace(/^@+/, '');
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) throw new Error(key);
  return `@${handle}`;
};

/** Merges new handles into the saved ones; null clears one. */
export const mergeSocials = (saved: unknown, changes: Partial<Record<SocialKey, string>>): Socials | null => {
  const current = (saved && typeof saved === 'object' ? saved : {}) as Socials;
  const next: Socials = { ...current };
  for (const key of SOCIAL_KEYS) {
    if (changes[key] === undefined) continue;
    const handle = cleanHandle(key, changes[key]!);
    if (handle) next[key] = handle;
    else delete next[key];
  }
  return Object.keys(next).length ? next : null;
};
