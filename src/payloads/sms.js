/**
 * Text message.
 *
 * A genuine format disagreement, reported rather than silently resolved.
 *
 * RFC 5724 defines `sms:+40722123456?body=Hello`. ZXing, and most of the QR
 * ecosystem, uses `SMSTO:+40722123456:Hello`. They are not compatible and
 * neither is universally supported:
 *
 *   SMSTO:  Android and dedicated scanners read it. iOS does not recognise
 *           SMSTO at all and shows the raw string.
 *   sms:    iOS reads it and pre-fills the body. Android reads it, though a
 *           few older builds ignore the ?body= parameter.
 *
 * sms: is the actual standard and is the one iOS understands, so it is the
 * default, with SMSTO offered for Android-only deployments. Most generators
 * pick one silently, which is how a printed code ends up working on half the
 * phones that scan it.
 */

import { encodeComponent } from './email.js';
import { normaliseNumber } from './tel.js';

/** @type {{value: string, label: string, note: string}[]} */
export const SMS_FORMATS = [
  { value: 'rfc', label: 'sms: (recommended)', note: 'The RFC 5724 standard form. Works on iPhone and on Android.' },
  { value: 'smsto', label: 'SMSTO:', note: 'The older ZXing form. Android and dedicated scanners only: an iPhone shows it as plain text.' },
];

/**
 * @param {{number: string, message?: string, format?: 'rfc'|'smsto'}} input
 * @returns {string}
 */
export function buildSms(input) {
  const number = normaliseNumber(input.number);
  const message = input.message ?? '';
  if ((input.format ?? 'rfc') === 'smsto') {
    return message ? `SMSTO:${number}:${message}` : `SMSTO:${number}`;
  }
  return message ? `sms:${number}?body=${encodeComponent(message)}` : `sms:${number}`;
}

/** @param {{number: string, message?: string}} input */
export function validateSms(input) {
  const out = [];
  const n = normaliseNumber(input.number);
  if (!n) {
    out.push({ field: 'number', level: 'error', message: 'Enter the number the message should go to.' });
  } else if (!n.startsWith('+')) {
    out.push({
      field: 'number',
      level: 'warning',
      message: 'Add the country code with a plus, like +40. Without it the code only works inside one country.',
    });
  }
  if (input.message && input.message.length > 160) {
    out.push({
      field: 'message',
      level: 'warning',
      message: 'Over 160 characters the message may be sent as several texts, and it makes the code denser. A short line works better.',
    });
  }
  return out;
}

export const SMS_EXAMPLE = { number: '+40722123456', message: 'STOP', format: 'rfc' };

export const SMS_SUPPORT =
  'With the sms: form, iPhone and Android both open the messaging app with the number and text filled in. A confirmation tap is always required before anything sends.';
