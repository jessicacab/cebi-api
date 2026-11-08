import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Where we reach a user: the email or mobile number they typed in the app's
 * single "Email or mobile number" field.
 */
export type Contact =
  | { channel: 'email'; email: string }
  | { channel: 'sms'; phone: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PH_MOBILE = /^9\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Turns what the user typed into a contact, or null when it is neither a
 * valid email nor a valid mobile number.
 * Emails are trimmed and lowercased. Philippine numbers in any common form
 * (09171234567, 9171234567, 639171234567, +63 917 123 4567) become E.164
 * (+639171234567). Other countries must be typed with "+" and country code.
 */
export const parseContact = (raw: unknown): Contact | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;

  if (value.includes('@') || /[a-z]/i.test(value)) {
    const email = value.toLowerCase();
    return EMAIL.test(email) && email.length <= 254 ? { channel: 'email', email } : null;
  }

  if (!/^[+\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  const local = digits.replace(/^63/, '').replace(/^0/, '');
  const isPh = !value.startsWith('+') || digits.startsWith('63');
  if (isPh) return PH_MOBILE.test(local) ? { channel: 'sms', phone: `+63${local}` } : null;

  const phone = `+${digits}`;
  return E164.test(phone) ? { channel: 'sms', phone } : null;
};

/** The contact as Supabase expects it in sign-in calls. */
export const contactParams = (contact: Contact) =>
  contact.channel === 'email' ? { email: contact.email } : { phone: contact.phone };

/** class-validator rule for a `contact` field (email or mobile number). */
export const IsContact = (options?: ValidationOptions) => (target: object, propertyName: string) =>
  registerDecorator({
    name: 'isContact',
    target: target.constructor,
    propertyName,
    options: { message: `${propertyName} must be a valid email or mobile number`, ...options },
    validator: { validate: (value: unknown) => parseContact(value) !== null },
  });
