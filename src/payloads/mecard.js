/**
 * Contact card, meCard.
 *
 * Originally an NTT DoCoMo format for Japanese feature phones, still widely
 * read and much shorter than vCard, which matters when the code has to fit on
 * a small label.
 *
 * Format: MECARD:N:Last,First;TEL:...;EMAIL:...;;
 *
 * Escaping: backslash, semicolon, colon and comma are special and are escaped
 * with a backslash. The comma matters more than it looks, because the N field
 * uses a comma to separate surname from given name, so an unescaped comma in a
 * company name silently turns into a name boundary.
 */

/** @param {string} value */
export function escapeMeCard(value) {
  return String(value ?? '').replace(/([\\;:,])/g, '\\$1');
}

/**
 * @param {import('./vcard.js').ContactInput} input
 * @returns {string}
 */
export function buildMeCard(input) {
  const e = escapeMeCard;
  const parts = [];

  const last = input.lastName ?? '';
  const first = input.firstName ?? '';
  if (last || first) parts.push(`N:${e(last)},${e(first)}`);
  else if (input.organisation) parts.push(`N:${e(input.organisation)}`);

  if (input.organisation && (last || first)) parts.push(`ORG:${e(input.organisation)}`);
  if (input.mobile) parts.push(`TEL:${e(input.mobile)}`);
  if (input.phone) parts.push(`TEL:${e(input.phone)}`);
  if (input.email) parts.push(`EMAIL:${e(input.email)}`);
  if (input.website) parts.push(`URL:${e(input.website)}`);

  const adr = [input.street, input.city, input.region, input.postcode, input.country];
  if (adr.some(Boolean)) {
    // ADR is comma-separated in meCard, and the separators must stay unescaped
    // while the values inside them are escaped individually.
    parts.push(`ADR:,,${adr.map((v) => e(v ?? '')).join(',')}`);
  }
  if (input.note) parts.push(`NOTE:${e(input.note)}`);

  return `MECARD:${parts.map((p) => `${p};`).join('')};`;
}

export const MECARD_SUPPORT =
  'Read by Android and by most scanner apps. iOS recognises meCard from the camera too. It carries fewer fields than vCard, so a job title or a note may be dropped by the contact app that receives it.';
