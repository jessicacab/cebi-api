import { cleanHandle, cleanLandline, cleanMobile, cleanText, mergeSocials } from './business-profile-rules.js';

describe('business profile rules', () => {
  it('trims text, clears blanks and keeps unsent fields', () => {
    expect(cleanText('  Lola   Nena ')).toBe('Lola Nena');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(undefined)).toBeUndefined();
  });

  it('turns Philippine mobile numbers into +63 and rejects other text', () => {
    expect(cleanMobile('0917 555 0142')).toBe('+639175550142');
    expect(cleanMobile('')).toBeNull();
    expect(() => cleanMobile('hello')).toThrow();
    expect(() => cleanMobile('(032) 345 6789')).toThrow();
  });

  it('accepts landlines with local numbers', () => {
    expect(cleanLandline('(032) 345 6789')).toBe('(032) 345 6789');
    expect(cleanLandline('345-6789 loc. 2')).toBe('345-6789 loc. 2');
    expect(() => cleanLandline('call me')).toThrow();
  });

  it('makes handles from what people paste', () => {
    expect(cleanHandle('tiktok', 'lolanenacebu')).toBe('@lolanenacebu');
    expect(cleanHandle('tiktok', 'https://www.tiktok.com/@lolanenacebu?lang=en')).toBe('@lolanenacebu');
    expect(cleanHandle('instagram', 'instagram.com/lolanenas.cebu/')).toBe('@lolanenas.cebu');
    expect(cleanHandle('facebook', "Lola Nena's Lechon House")).toBe("Lola Nena's Lechon House");
    expect(() => cleanHandle('instagram', 'not a handle!')).toThrow();
  });

  it('merges handle changes and clears empty ones', () => {
    expect(mergeSocials({ tiktok: '@a' }, { instagram: 'b' })).toEqual({ tiktok: '@a', instagram: '@b' });
    expect(mergeSocials({ tiktok: '@a' }, { tiktok: '' })).toBeNull();
  });
});
