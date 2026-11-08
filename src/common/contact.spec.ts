import { parseContact } from './contact.js';

describe('parseContact', () => {
  it('trims and lowercases emails', () => {
    expect(parseContact('  Maya@Example.COM ')).toEqual({ channel: 'email', email: 'maya@example.com' });
  });

  it.each(['09171234567', '9171234567', '639171234567', '+63 917 123 4567', '0917-123-4567'])(
    'reads the PH mobile number %s',
    (raw) => {
      expect(parseContact(raw)).toEqual({ channel: 'sms', phone: '+639171234567' });
    },
  );

  it('keeps other countries when typed with a country code', () => {
    expect(parseContact('+1 415 555 0100')).toEqual({ channel: 'sms', phone: '+14155550100' });
  });

  it.each(['', '   ', 'maya@', 'maya@example', '0817123456', '12345', '+63 817 123 4567', 42, null])(
    'rejects %s',
    (raw) => {
      expect(parseContact(raw)).toBeNull();
    },
  );
});
