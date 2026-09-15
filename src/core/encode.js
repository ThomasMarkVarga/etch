/**
 * Encoding: the thin, opinionated layer over Nayuki's qrcodegen.
 *
 * Everything here is about making the encoder's decisions visible. Most
 * generators choose error correction, version, segmentation and mask silently,
 * then hand you a picture. Someone about to print 5,000 menus deserves to know
 * that their code just went from version 6 to version 7, because that made
 * every module 12% smaller at the same printed width.
 */

import qrcodegen from '../vendor/qrcodegen.js';
import { makeSegmentsOptimally, makeByteSegments, utf8Bytes } from './segments.js';

const { QrCode, QrSegment } = qrcodegen;

/** Minimum quiet zone in modules, per ISO/IEC 18004. Never go below this. */
export const MIN_QUIET_ZONE = 4;

/** ECI assignment number 26 is UTF-8. */
const ECI_UTF8 = 26;

/**
 * @typedef {'L'|'M'|'Q'|'H'} EccLetter
 */

/** @type {Record<EccLetter, object>} */
const ECC_BY_LETTER = {
  L: QrCode.Ecc.LOW,
  M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE,
  H: QrCode.Ecc.HIGH,
};

/** @type {EccLetter[]} */
export const ECC_LETTERS = ['L', 'M', 'Q', 'H'];

/**
 * Nominal recovery capacity of each level, as a fraction of codewords.
 * These are the figures from the standard. They are not a promise about a
 * specific printed code, because print defects and dirt eat the same budget.
 */
export const ECC_RECOVERY = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

/** Plain-language gloss for every level, for use anywhere a letter appears. */
export const ECC_COPY = {
  L: {
    label: 'Low',
    short: 'recovers about 7% damage',
    detail:
      'The smallest, least dense code. Good for clean printing on paper that will not get handled much. Little margin for scuffs.',
  },
  M: {
    label: 'Medium',
    short: 'recovers about 15% damage',
    detail:
      'The usual choice. Survives normal handling and print imperfection without making the code much denser.',
  },
  Q: {
    label: 'Quartile',
    short: 'recovers about 25% damage',
    detail:
      'For codes that will be handled, get dirty, or carry a small logo. Denser, so print it a little larger.',
  },
  H: {
    label: 'High',
    short: 'recovers about 30% damage',
    detail:
      'For harsh surfaces, laminate, equipment labels, or a centre logo. Noticeably denser: at the same printed width every square gets smaller, which can make it harder to scan, not easier.',
  },
};

/** @param {EccLetter} letter */
export function eccFromLetter(letter) {
  const ecc = ECC_BY_LETTER[letter];
  if (!ecc) throw new RangeError(`Unknown error correction level: ${letter}`);
  return ecc;
}

/** @param {object} ecc qrcodegen Ecc object @returns {EccLetter} */
export function letterFromEcc(ecc) {
  return /** @type {EccLetter} */ (ECC_LETTERS[ecc.ordinal] ?? 'M');
}

/**
 * @typedef {object} EncodeOptions
 * @property {EccLetter} [ecc] Requested error correction level. Default 'M'.
 * @property {number} [minVersion] Version floor, 1-40. Default 1.
 * @property {number} [maxVersion] Version ceiling, 1-40. Default 40.
 * @property {number} [mask] Mask pattern 0-7, or -1 for automatic. Default -1.
 * @property {boolean} [boostEcc] Raise the level for free if it fits the same
 *   version. Default true. Free robustness, but it means the level you get can
 *   be higher than the level you asked for, so the result always reports back
 *   what was actually used.
 * @property {boolean} [declareUtf8] Prepend an ECI header declaring UTF-8.
 *   Default false: see the note on ECI in the result.
 * @property {boolean} [optimalSegmentation] Default true.
 */

/**
 * @typedef {object} EncodeResult
 * @property {boolean[][]} matrix Row-major, true = dark. No quiet zone.
 * @property {number} size Modules per side, excluding quiet zone.
 * @property {number} version
 * @property {EccLetter} ecc Level actually used, after any boost.
 * @property {EccLetter} requestedEcc Level asked for.
 * @property {boolean} eccWasBoosted
 * @property {number} mask Mask pattern actually used, 0-7.
 * @property {boolean} maskWasAutomatic
 * @property {{mode: string, chars: number, text: string}[]} segmentPlan
 * @property {number} usedBits
 * @property {number} capacityBits
 * @property {number} remainingBits
 * @property {boolean} declaredUtf8
 * @property {boolean} hasNonAscii
 * @property {string} text The exact string encoded.
 */

/**
 * Encode text into a module matrix, reporting every decision taken.
 *
 * @param {string} text
 * @param {EncodeOptions} [options]
 * @returns {EncodeResult}
 * @throws {RangeError} when the text cannot fit, with `usedBits`/`capacityBits`
 *   attached. Never truncates.
 */
export function encode(text, options = {}) {
  const {
    ecc: eccLetter = 'M',
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
    boostEcc = true,
    declareUtf8 = false,
    optimalSegmentation = true,
  } = options;

  if (typeof text !== 'string') throw new TypeError('Text must be a string');
  if (text.length === 0) throw new RangeError('There is nothing to encode yet.');
  if (!Number.isInteger(minVersion) || minVersion < 1 || minVersion > 40) {
    throw new RangeError('Version floor must be a whole number from 1 to 40.');
  }
  if (!Number.isInteger(maxVersion) || maxVersion < minVersion || maxVersion > 40) {
    throw new RangeError('Version ceiling must be between the floor and 40.');
  }
  if (mask !== -1 && (!Number.isInteger(mask) || mask < 0 || mask > 7)) {
    throw new RangeError('Mask must be a whole number from 0 to 7, or automatic.');
  }

  const requestedEcc = eccFromLetter(eccLetter);
  const hasNonAscii = /[^\x00-\x7F]/.test(text);

  let segments;
  let segmentPlan;
  if (optimalSegmentation) {
    const built = makeSegmentsOptimally(text, requestedEcc, minVersion, maxVersion);
    segments = built.segments;
    segmentPlan = built.plan;
  } else {
    segments = makeByteSegments(text);
    segmentPlan = [{ mode: 'byte', chars: text.length, text }];
  }

  if (declareUtf8) {
    segments = [QrSegment.makeEci(ECI_UTF8), ...segments];
  }

  let qr;
  try {
    qr = QrCode.encodeSegments(segments, requestedEcc, minVersion, maxVersion, mask, boostEcc);
  } catch (err) {
    const wrapped = new RangeError('This is too much data to fit in a QR code.');
    /** @type {any} */ (wrapped).cause = err;
    throw wrapped;
  }

  const actualEcc = letterFromEcc(qr.errorCorrectionLevel);
  const capacityBits = QrCode.getNumDataCodewords(qr.version, qr.errorCorrectionLevel) * 8;
  const usedBits = QrSegment.getTotalBits(segments, qr.version);

  const size = qr.size;
  const matrix = [];
  for (let y = 0; y < size; y++) {
    const row = new Array(size);
    for (let x = 0; x < size; x++) row[x] = qr.getModule(x, y);
    matrix.push(row);
  }

  return {
    matrix,
    size,
    version: qr.version,
    ecc: actualEcc,
    requestedEcc: eccLetter,
    eccWasBoosted: actualEcc !== eccLetter,
    mask: qr.mask,
    maskWasAutomatic: mask === -1,
    segmentPlan,
    usedBits,
    capacityBits,
    remainingBits: capacityBits - usedBits,
    declaredUtf8: declareUtf8,
    hasNonAscii,
    text,
  };
}

/**
 * Encode without throwing, for live typing.
 * @param {string} text
 * @param {EncodeOptions} [options]
 * @returns {{ok: true, result: EncodeResult} | {ok: false, error: string, detail?: string}}
 */
export function tryEncode(text, options = {}) {
  try {
    return { ok: true, result: encode(text, options) };
  } catch (err) {
    const e = /** @type {any} */ (err);
    let detail;
    if (typeof e.usedBits === 'number' && typeof e.capacityBits === 'number') {
      const over = Math.ceil((e.usedBits - e.capacityBits) / 8);
      detail = `About ${over} bytes too long for the largest QR code there is. Shorten the text, or split it across two codes.`;
    }
    return { ok: false, error: e.message || 'Could not encode this.', detail };
  }
}

/**
 * The smallest version this text fits in at a given level, ignoring any floor.
 * Used to tell someone that their version floor is what is making the code
 * denser, rather than their text.
 * @param {string} text
 * @param {EccLetter} eccLetter
 * @returns {number|null}
 */
export function naturalVersion(text, eccLetter) {
  if (!text) return null;
  try {
    return encode(text, { ecc: eccLetter, minVersion: 1, boostEcc: false }).version;
  } catch {
    return null;
  }
}

/**
 * Roughly how many more characters of the same kind fit before the code steps
 * up a version. Approximate on purpose: the exact answer depends on where mode
 * boundaries land, and an approximate warning beats no warning.
 *
 * @param {EncodeResult} result
 * @returns {{charsLeft: number, mode: string, nextVersionAt: number|null}}
 */
export function headroom(result) {
  const last = result.segmentPlan[result.segmentPlan.length - 1];
  const mode = last ? last.mode : 'byte';
  const bitsPerChar = mode === 'numeric' ? 10 / 3 : mode === 'alphanumeric' ? 11 / 2 : 8;
  const charsLeft = Math.max(0, Math.floor(result.remainingBits / bitsPerChar));
  return {
    charsLeft,
    mode,
    nextVersionAt: result.version < 40 ? result.version + 1 : null,
  };
}

/**
 * Transformations that might shrink the code, each reported with the version it
 * would produce. Only transformations that are safe for scanners are offered.
 *
 * Uppercasing matters because alphanumeric mode covers only uppercase A-Z: a
 * URL host is case-insensitive per RFC 3986 §6.2.2.1, so uppercasing it changes
 * nothing about where the link goes, but it can let the whole string use
 * alphanumeric mode at 5.5 bits per character instead of byte mode at 8.
 *
 * @param {string} text
 * @param {EccLetter} eccLetter
 * @param {number} [minVersion]
 * @returns {{id: string, label: string, explain: string, text: string, version: number, saves: number}[]}
 */
export function suggestShrinks(text, eccLetter, minVersion = 1) {
  if (!text) return [];
  const base = naturalVersionAtFloor(text, eccLetter, minVersion);
  if (base === null) return [];

  /** @type {{id: string, label: string, explain: string, text: string}[]} */
  const candidates = [];

  const urlMatch = /^(https?):\/\/([^/?#\s]+)(.*)$/i.exec(text.trim());
  if (urlMatch) {
    const [, scheme, host, rest] = urlMatch;

    if (scheme.toLowerCase() === 'https' && host.toUpperCase() !== host) {
      candidates.push({
        id: 'upper-host',
        label: 'Put the site name in capitals',
        explain:
          'Web addresses are not case sensitive in the site-name part, so HTTPS://EXAMPLE.COM/menu goes to exactly the same page. Capitals let the code use a denser packing mode.',
        text: `${scheme.toUpperCase()}://${host.toUpperCase()}${rest}`,
      });
    }

    const upperAll = text.trim().toUpperCase();
    if (upperAll !== text.trim() && rest && rest !== '/') {
      candidates.push({
        id: 'upper-all',
        label: 'Put the whole address in capitals',
        explain:
          'Only do this if the part after the site name is case insensitive on your server. Many are not: /Menu and /menu can be different pages. Check the link works before printing.',
        text: upperAll,
      });
    }

    if (scheme.toLowerCase() === 'https') {
      candidates.push({
        id: 'drop-scheme',
        label: 'Drop the https:// prefix',
        explain:
          'Phone cameras and every mainstream scanner app add https:// back. Some older dedicated scanners and a few in-app browsers will treat it as plain text instead, so this is the riskier of the two savings.',
        text: `${host}${rest}`,
      });
    }
  }

  const out = [];
  for (const c of candidates) {
    const v = naturalVersionAtFloor(c.text, eccLetter, minVersion);
    if (v !== null && v < base) out.push({ ...c, version: v, saves: base - v });
  }
  return out.sort((a, b) => b.saves - a.saves);
}

/**
 * @param {string} text
 * @param {EccLetter} eccLetter
 * @param {number} minVersion
 * @returns {number|null}
 */
function naturalVersionAtFloor(text, eccLetter, minVersion) {
  try {
    return encode(text, { ecc: eccLetter, minVersion, boostEcc: false }).version;
  } catch {
    return null;
  }
}

/**
 * Data capacity in bits at a version and level, for capacity tables and tests.
 * @param {number} version
 * @param {EccLetter} eccLetter
 * @returns {number}
 */
export function capacityBitsFor(version, eccLetter) {
  return QrCode.getNumDataCodewords(version, eccFromLetter(eccLetter)) * 8;
}

export { utf8Bytes };
