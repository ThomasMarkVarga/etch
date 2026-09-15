/**
 * Telephone number, as a tel: URI (RFC 3966).
 *
 * The only thing that really matters here is the international prefix. A
 * number stored as 0722 123 456 works when dialled inside Romania and fails
 * for anyone abroad; +40 722 123 456 works everywhere. Printed material
 * outlives the assumption that everyone scanning it is local.
 */

/** @param {string} raw */
export function normaliseNumber(raw) {
  return String(raw ?? '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

/** @param {{number: string}} input @returns {string} */
export function buildTel(input) {
  return `tel:${normaliseNumber(input.number)}`;
}

/** @param {{number: string}} input */
export function validateTel(input) {
  const out = [];
  const n = normaliseNumber(input.number);
  if (!n) {
    out.push({ field: 'number', level: 'error', message: 'Enter a phone number.' });
    return out;
  }
  if (!n.startsWith('+')) {
    out.push({
      field: 'number',
      level: 'warning',
      message: 'Add the country code with a plus, like +40 for Romania. Without it the number only works for people dialling from the same country.',
    });
  }
  if (n.replace(/\D/g, '').length < 6) {
    out.push({ field: 'number', level: 'error', message: 'That is too short to be a phone number.' });
  }
  if (n.replace(/\D/g, '').length > 15) {
    out.push({ field: 'number', level: 'warning', message: 'International numbers are at most 15 digits (ITU-T E.164).' });
  }
  return out;
}

export const TEL_EXAMPLE = { number: '+40 722 123 456' };

export const TEL_SUPPORT =
  'Universally supported. Phone cameras show the number and offer to call. Most will not dial without a confirmation tap, which is the behaviour you want.';
