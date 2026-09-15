/**
 * Contact card, vCard 3.0 (RFC 2426).
 *
 * Version 3.0 rather than 4.0 on purpose. iOS and Android both parse 3.0
 * reliably; 4.0 support in phone contact importers is patchier, and a contact
 * card that imports with empty fields is worse than one with fewer features.
 *
 * Escaping rules (RFC 2426 section 2.4.2): within a value, backslash, comma
 * and semicolon must be escaped, and a literal newline becomes \n. Semicolons
 * are the separator inside structured values such as N and ADR, which is why
 * an unescaped semicolon in a surname silently shifts every later field by
 * one. Line folding at 75 octets is part of the spec; it is deliberately not
 * applied here, because some phone parsers mishandle folded lines and a QR
 * payload has no line-length problem to solve.
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeVCard(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * @typedef {object} ContactInput
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [organisation]
 * @property {string} [title]
 * @property {string} [phone]
 * @property {string} [mobile]
 * @property {string} [email]
 * @property {string} [website]
 * @property {string} [street]
 * @property {string} [city]
 * @property {string} [region]
 * @property {string} [postcode]
 * @property {string} [country]
 * @property {string} [note]
 */

/**
 * @param {ContactInput} input
 * @returns {string}
 */
export function buildVCard(input) {
  const e = escapeVCard;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

  const last = input.lastName ?? '';
  const first = input.firstName ?? '';
  // N is structured: Family;Given;Additional;Prefix;Suffix
  lines.push(`N:${e(last)};${e(first)};;;`);
  const fn = [first, last].filter(Boolean).join(' ').trim();
  lines.push(`FN:${e(fn || input.organisation || '')}`);

  if (input.organisation) lines.push(`ORG:${e(input.organisation)}`);
  if (input.title) lines.push(`TITLE:${e(input.title)}`);
  if (input.phone) lines.push(`TEL;TYPE=WORK,VOICE:${e(input.phone)}`);
  if (input.mobile) lines.push(`TEL;TYPE=CELL,VOICE:${e(input.mobile)}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${e(input.email)}`);
  if (input.website) lines.push(`URL:${e(input.website)}`);

  const adr = [input.street, input.city, input.region, input.postcode, input.country];
  if (adr.some(Boolean)) {
    // ADR is structured: PO Box;Extended;Street;Locality;Region;Postcode;Country
    lines.push(
      `ADR;TYPE=WORK:;;${e(input.street ?? '')};${e(input.city ?? '')};${e(input.region ?? '')};${e(input.postcode ?? '')};${e(input.country ?? '')}`,
    );
  }
  if (input.note) lines.push(`NOTE:${e(input.note)}`);

  lines.push('END:VCARD');
  // CRLF is what the specification requires, and some Android importers are
  // strict about it even though most accept bare LF.
  return lines.join('\r\n');
}

/** @param {ContactInput} input */
export function validateContact(input) {
  const out = [];
  const hasName = !!(input.firstName || input.lastName || input.organisation);
  if (!hasName) {
    out.push({ field: 'firstName', level: 'error', message: 'Enter at least a name or an organisation, or there is nothing to save.' });
  }
  if (!input.phone && !input.mobile && !input.email) {
    out.push({
      field: 'phone',
      level: 'warning',
      message: 'This card has no phone number and no email, so scanning it saves a name and nothing to contact.',
    });
  }
  if (input.phone && !input.phone.replace(/[^\d+]/g, '').startsWith('+')) {
    out.push({ field: 'phone', level: 'warning', message: 'Add the country code with a plus, like +40, so the number works from abroad.' });
  }
  if (input.website && !/^https?:\/\//i.test(input.website)) {
    out.push({ field: 'website', level: 'warning', message: 'Put https:// in front of the website, or some phones will not make it tappable.' });
  }
  return out;
}

export const VCARD_EXAMPLE = {
  firstName: 'Ana',
  lastName: 'Popescu-Ionescu',
  organisation: 'Atelier Lemn & Piatră',
  title: 'Furniture maker',
  mobile: '+40 722 123 456',
  email: 'ana@example.com',
  website: 'https://example.com',
  city: 'Cluj-Napoca',
  country: 'Romania',
};

export const VCARD_SUPPORT =
  'iOS and Android both recognise a vCard from the camera and offer to create a contact. vCard carries more fields than meCard and is the safer default; its cost is a longer payload and therefore a denser code.';

/** Which of the two contact formats to use, explained without jargon. */
export const CONTACT_FORMAT_HELP = {
  vcard:
    'vCard is the format email programs and phones use for contact files. It holds more detail, including a job title, a full postal address and a note. Choose this unless the code has to be small.',
  mecard:
    'meCard is an older, much shorter format from the days of Japanese feature phones. It makes a noticeably smaller code, which matters on a small label, but it carries fewer fields and a handful of contact apps ignore it.',
};
