/**
 * SEPA credit transfer, EPC069-12.
 *
 * The European Payments Council's "Quick Response Code Guidelines to Enable
 * Data Capture for the Initiation of a SEPA Credit Transfer". Used by banking
 * apps across the euro area to fill in a transfer from a printed invoice.
 *
 * This format is strictly positional: exactly twelve lines, in exactly this
 * order, separated by LF. A missing line is not a missing field, it shifts
 * every field below it, so the bank app reads the amount as a purpose code.
 *
 *    1  Service tag            BCD
 *    2  Version                001 or 002
 *    3  Character set          1 = UTF-8
 *    4  Identification         SCT
 *    5  BIC                    required in version 001, optional in 002
 *    6  Beneficiary name       max 70
 *    7  IBAN                   max 34
 *    8  Amount                 EUR1.00 to EUR999999999.99, or empty
 *    9  Purpose code           max 4, optional
 *   10  Structured reference   max 35   } only one of these two
 *   11  Unstructured remittance max 140 } may be used
 *   12  Beneficiary to originator information, max 70
 *
 * Total payload must not exceed 331 bytes. The guidelines specify error
 * correction level M, which is why selecting this payload type nudges the
 * level rather than leaving whatever was set before.
 *
 * Version 002 is the default here: it makes BIC optional, which is correct
 * inside SEPA since IBAN-only transfers became the norm.
 */

/** Maximum encoded size the specification allows. */
export const SEPA_MAX_BYTES = 331;

/** The guidelines name level M explicitly. */
export const SEPA_RECOMMENDED_ECC = 'M';

/* ------------------------------------------------------------------ IBAN -- */

/** IBAN lengths per country, from the ISO 13616 registry. */
const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30,
  KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27,
  MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28,
  PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24,
  SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20,
};

/** Countries in the SEPA scheme, where BIC may be omitted. */
const SEPA_COUNTRIES = new Set([
  'AT','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GI','GR','HR',
  'HU','IE','IS','IT','LI','LT','LU','LV','MC','MT','NL','NO','PL','PT','RO','SE',
  'SI','SK','SM','VA',
]);

/** @param {string} iban */
export function normaliseIban(iban) {
  return String(iban ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Validate an IBAN with the ISO 7064 mod-97-10 checksum, which is the whole
 * point of an IBAN: it catches a mistyped digit. A regex only checks shape and
 * would happily accept a transfer to nobody.
 *
 * @param {string} raw
 * @returns {{valid: boolean, reason: string|null, country: string|null, formatted: string}}
 */
export function validateIban(raw) {
  const iban = normaliseIban(raw);
  const formatted = iban.replace(/(.{4})/g, '$1 ').trim();

  if (!iban) return { valid: false, reason: 'empty', country: null, formatted };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { valid: false, reason: 'shape', country: null, formatted };
  }

  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (!expected) return { valid: false, reason: 'country', country, formatted };
  if (iban.length !== expected) return { valid: false, reason: 'length', country, formatted };

  // Move the first four characters to the end, map letters to numbers
  // (A = 10 ... Z = 35), then check the whole thing mod 97 equals 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 55 : Number(ch);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  if (remainder !== 1) return { valid: false, reason: 'checksum', country, formatted };

  return { valid: true, reason: null, country, formatted };
}

/** @param {string} country */
export function ibanExpectedLength(country) {
  return IBAN_LENGTHS[String(country ?? '').toUpperCase()] ?? null;
}

/** @param {string} country */
export function isSepaCountry(country) {
  return SEPA_COUNTRIES.has(String(country ?? '').toUpperCase());
}

/* ----------------------------------------------------------------- build -- */

/**
 * @typedef {object} SepaInput
 * @property {string} name Beneficiary name, max 70.
 * @property {string} iban
 * @property {string} [bic]
 * @property {string|number} [amount] Euro, e.g. 49.90. Empty means the payer types it.
 * @property {string} [reference] Structured creditor reference (ISO 11649).
 * @property {string} [remittance] Free-text note, max 140.
 * @property {string} [purpose] 4-character purpose code.
 * @property {string} [information] Note shown to the payer, max 70.
 * @property {'001'|'002'} [version]
 */

/**
 * @param {string|number|undefined} amount
 * @returns {string}
 */
function formatAmount(amount) {
  if (amount === undefined || amount === '' || amount === null) return '';
  const n = Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '';
  // The specification requires the EUR prefix and at most two decimals.
  return `EUR${n.toFixed(2)}`;
}

/**
 * @param {SepaInput} input
 * @returns {string}
 */
export function buildSepa(input) {
  const version = input.version ?? '002';
  const iban = normaliseIban(input.iban);

  // Only one of structured reference and unstructured remittance may be set.
  // The structured one wins if both are filled in, matching the guidelines.
  const reference = (input.reference ?? '').trim();
  const remittance = reference ? '' : (input.remittance ?? '').trim();

  const lines = [
    'BCD',
    version,
    '1', // UTF-8
    'SCT',
    (input.bic ?? '').trim().toUpperCase(),
    (input.name ?? '').trim().slice(0, 70),
    iban,
    formatAmount(input.amount),
    (input.purpose ?? '').trim().slice(0, 4),
    reference.slice(0, 35),
    remittance.slice(0, 140),
    (input.information ?? '').trim().slice(0, 70),
  ];

  // Trailing empty lines may be omitted, but never a line in the middle.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

/** @param {SepaInput} input */
export function validateSepa(input) {
  const out = [];
  const version = input.version ?? '002';

  const name = (input.name ?? '').trim();
  if (!name) {
    out.push({ field: 'name', level: 'error', message: 'Enter the name of the person or business being paid, exactly as the bank has it.' });
  } else if (name.length > 70) {
    out.push({ field: 'name', level: 'error', message: `The name can be at most 70 characters. This one is ${name.length}.` });
  }

  const iban = validateIban(input.iban);
  if (!iban.valid) {
    const messages = {
      empty: 'Enter the IBAN of the account being paid.',
      shape: 'An IBAN starts with two letters for the country and two check digits, like RO49 AAAA 1B31 0075 9384 0000.',
      country: `${iban.country} is not a country code used for IBANs. Check the first two letters.`,
      length: `An IBAN for ${iban.country} is ${ibanExpectedLength(iban.country ?? '')} characters. This one is ${normaliseIban(input.iban).length}.`,
      checksum: 'This IBAN fails its own check digits, which almost always means a typed character is wrong. Copy it from a bank statement rather than retyping it.',
    };
    out.push({ field: 'iban', level: 'error', message: messages[iban.reason ?? 'shape'] });
  }

  const bic = (input.bic ?? '').trim();
  if (version === '001' && !bic) {
    out.push({ field: 'bic', level: 'error', message: 'Version 001 requires a BIC. Switch to version 002 to leave it out.' });
  } else if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(bic)) {
    out.push({ field: 'bic', level: 'error', message: 'A BIC is 8 or 11 characters, like BTRLRO22.' });
  } else if (!bic && iban.country && !isSepaCountry(iban.country)) {
    out.push({ field: 'bic', level: 'warning', message: `${iban.country} is outside the SEPA area, so a BIC is usually required.` });
  }

  if (input.amount !== undefined && input.amount !== '') {
    const n = Number(String(input.amount).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      out.push({ field: 'amount', level: 'error', message: 'The amount must be a number greater than zero, or left empty so the payer types it.' });
    } else if (n > 999999999.99) {
      out.push({ field: 'amount', level: 'error', message: 'The largest amount this format allows is 999,999,999.99 euro.' });
    } else if (String(input.amount).includes(',')) {
      out.push({ field: 'amount', level: 'warning', message: 'Written with a decimal point in the code, as the format requires. The payer still sees it in their own local format.' });
    }
  }

  if ((input.reference ?? '').trim() && (input.remittance ?? '').trim()) {
    out.push({
      field: 'remittance',
      level: 'warning',
      message: 'The format allows a structured reference or a free-text note, not both. The structured reference is being used and the note is left out.',
    });
  }

  if ((input.remittance ?? '').length > 140) {
    out.push({ field: 'remittance', level: 'error', message: `The note can be at most 140 characters. This one is ${input.remittance?.length}.` });
  }
  if ((input.reference ?? '').length > 35) {
    out.push({ field: 'reference', level: 'error', message: `A structured reference can be at most 35 characters. This one is ${input.reference?.length}.` });
  }

  const size = new TextEncoder().encode(buildSepa(input)).length;
  if (size > SEPA_MAX_BYTES) {
    out.push({
      field: 'remittance',
      level: 'error',
      message: `The whole payment code must fit in ${SEPA_MAX_BYTES} bytes and this one is ${size}. Shorten the note or the name.`,
    });
  }

  return out;
}

export const SEPA_EXAMPLE = {
  name: 'Atelier Lemn SRL',
  iban: 'RO49 AAAA 1B31 0075 9384 0000',
  bic: '',
  amount: '149.50',
  remittance: 'Factura 2026-114',
  version: '002',
};

export const SEPA_SUPPORT =
  'Supported by banking apps across the euro area, including most Romanian, German, Austrian and Dutch banks, which read it from the invoice and fill in the transfer. It is not a card payment and nothing is charged by scanning: the payer still confirms in their own bank app. A general phone camera will show it as unreadable text, because only banking apps parse this format.';
