/**
 * Optimal mode segmentation.
 *
 * ISO/IEC 18004 lets a single QR code mix encoding modes: numeric (3.33 bits
 * per digit), alphanumeric (5.5 bits per char, but only 45 characters are
 * available and letters must be uppercase), and byte (8 bits per UTF-8 byte).
 * Choosing where to switch mode is a real optimisation problem, because each
 * switch costs a segment header. Picking well can drop a code an entire
 * version, which makes every module physically bigger at the same print size.
 *
 * Nayuki's JavaScript build ships only the simple heuristic in
 * `QrSegment.makeSegments` (all-numeric, else all-alphanumeric, else one byte
 * segment for the whole string). The optimal dynamic program exists only in his
 * Java and C++ builds, as `QrSegmentAdvanced.makeSegmentsOptimally`. This file
 * is a faithful port of that algorithm, with one documented omission below.
 *
 * Source: QrSegmentAdvanced.java, nayuki/QR-Code-generator (MIT).
 *
 * Omission: kanji mode. Supporting it needs a ~7000-entry Unicode-to-Shift-JIS
 * table, and skipping it never produces a wrong code, only a slightly larger
 * one for Japanese text, which still encodes correctly as UTF-8 bytes. The
 * audience for this app is Latin-script. Documented rather than silent.
 */

import qrcodegen from '../vendor/qrcodegen.js';

const { QrSegment, QrCode } = qrcodegen;
const { Mode } = QrSegment;

/** Mode identities considered by the dynamic program, in cost-table order. */
const MODE_TYPES = [Mode.BYTE, Mode.ALPHANUMERIC, Mode.NUMERIC];
const NUM_MODES = MODE_TYPES.length;

/** Human names, parallel to MODE_TYPES, for explaining the result in the UI. */
const MODE_NAMES = ['byte', 'alphanumeric', 'numeric'];

/**
 * UTF-8 byte length of a single Unicode code point.
 * @param {number} cp
 * @returns {number}
 */
function countUtf8Bytes(cp) {
  if (cp < 0) throw new RangeError('Invalid code point');
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  if (cp < 0x110000) return 4;
  throw new RangeError('Invalid code point');
}

/**
 * Split a string into Unicode code points (so astral characters such as emoji
 * count once, not twice).
 * @param {string} text
 * @returns {number[]}
 */
function toCodePoints(text) {
  const out = [];
  for (const ch of text) out.push(/** @type {number} */ (ch.codePointAt(0)));
  return out;
}

/**
 * Per-code-point mode assignment that minimises total bits at a given version.
 *
 * Costs are tracked in sixths of a bit so that the fractional costs of numeric
 * (10 bits / 3 chars) and alphanumeric (11 bits / 2 chars) stay exact integers.
 *
 * @param {number[]} codePoints
 * @param {number} version
 * @returns {number[]} index into MODE_TYPES for each code point
 */
function computeCharacterModes(codePoints, version) {
  const headCosts = MODE_TYPES.map((m) => (4 + m.numCharCountBits(version)) * 6);

  /** charModes[i][j] = mode index used at i, given the run ending at i is modeTypes[j] */
  const charModes = [];
  let prevCosts = headCosts.slice();

  for (let i = 0; i < codePoints.length; i++) {
    const c = codePoints[i];
    const curCosts = new Array(NUM_MODES).fill(Infinity);
    const row = new Array(NUM_MODES).fill(null);

    // Byte mode can always continue.
    curCosts[0] = prevCosts[0] + countUtf8Bytes(c) * 8 * 6;
    row[0] = 0;

    const ch = String.fromCodePoint(c);
    if (c < 0x80 && QrSegment.ALPHANUMERIC_CHARSET.indexOf(ch) !== -1) {
      curCosts[1] = prevCosts[1] + 33; // 5.5 bits
      row[1] = 1;
    }
    if (c >= 0x30 && c <= 0x39) {
      curCosts[2] = prevCosts[2] + 20; // 3.33 bits
      row[2] = 2;
    }

    // Consider ending the current segment and starting a new one in each mode.
    // A segment must end on a whole-bit boundary, hence the round-up by sixths.
    for (let j = 0; j < NUM_MODES; j++) {
      for (let k = 0; k < NUM_MODES; k++) {
        if (row[k] === null) continue;
        const newCost = Math.ceil(curCosts[k] / 6) * 6 + headCosts[j];
        if (row[j] === null || newCost < curCosts[j]) {
          curCosts[j] = newCost;
          row[j] = k;
        }
      }
    }

    charModes.push(row);
    prevCosts = curCosts;
  }

  // Walk backwards from the cheapest terminal mode.
  let curModeIndex = 0;
  for (let i = 1; i < NUM_MODES; i++) {
    if (prevCosts[i] < prevCosts[curModeIndex]) curModeIndex = i;
  }

  // charModes[i][j] holds the mode used AT position i given the run ending at i
  // is mode j, so the mode for position i is the stored value, not the index
  // being traced. Getting this backwards assigns each character the following
  // character's mode, which silently mis-segments and then throws the moment a
  // non-digit is handed to numeric mode.
  const result = new Array(codePoints.length);
  for (let i = codePoints.length - 1; i >= 0; i--) {
    const modeHere = /** @type {number} */ (charModes[i][curModeIndex]);
    result[i] = modeHere;
    curModeIndex = modeHere;
  }
  return result;
}

/**
 * Turn a mode assignment into actual qrcodegen segments.
 * @param {number[]} codePoints
 * @param {number[]} modeIndices
 * @returns {{segments: object[], plan: {mode: string, chars: number, text: string}[]}}
 */
function splitIntoSegments(codePoints, modeIndices) {
  const segments = [];
  const plan = [];
  let curMode = modeIndices[0];
  let start = 0;

  for (let i = 1; i <= codePoints.length; i++) {
    if (i < codePoints.length && modeIndices[i] === curMode) continue;
    const text = String.fromCodePoint(...codePoints.slice(start, i));
    if (curMode === 0) segments.push(QrSegment.makeBytes(utf8Bytes(text)));
    else if (curMode === 2) segments.push(QrSegment.makeNumeric(text));
    else segments.push(QrSegment.makeAlphanumeric(text));
    plan.push({ mode: MODE_NAMES[curMode], chars: i - start, text });
    if (i >= codePoints.length) break;
    curMode = modeIndices[i];
    start = i;
  }
  return { segments, plan };
}

/**
 * Encode a string as UTF-8 bytes.
 * @param {string} s
 * @returns {Uint8Array}
 */
export function utf8Bytes(s) {
  return new TextEncoder().encode(s);
}

/**
 * Optimal segments for one specific version.
 * @param {string} text
 * @param {number} version
 * @returns {{segments: object[], plan: {mode: string, chars: number, text: string}[]}}
 */
export function makeSegmentsForVersion(text, version) {
  const codePoints = toCodePoints(text);
  if (codePoints.length === 0) return { segments: [], plan: [] };
  return splitIntoSegments(codePoints, computeCharacterModes(codePoints, version));
}

/**
 * Optimal segments across a version range.
 *
 * Character-count field widths change at versions 10 and 27, so the optimal
 * split can differ between those bands. Like the reference implementation, the
 * plan is recomputed at each boundary rather than at every version.
 *
 * @param {string} text
 * @param {object} ecc qrcodegen Ecc object
 * @param {number} minVersion
 * @param {number} maxVersion
 * @returns {{segments: object[], plan: {mode: string, chars: number, text: string}[], version: number}}
 * @throws {RangeError} if the text cannot fit at maxVersion
 */
export function makeSegmentsOptimally(text, ecc, minVersion, maxVersion) {
  if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION)) {
    throw new RangeError('Invalid version range');
  }
  let built = null;
  for (let version = minVersion; ; version++) {
    if (version === minVersion || version === 10 || version === 27) {
      built = makeSegmentsForVersion(text, version);
    }
    const capacityBits = QrCode.getNumDataCodewords(version, ecc) * 8;
    const usedBits = QrSegment.getTotalBits(/** @type {any} */ (built).segments, version);
    if (usedBits !== Infinity && usedBits !== -1 && usedBits <= capacityBits) {
      return { .../** @type {any} */ (built), version };
    }
    if (version >= maxVersion) {
      const err = new RangeError('This is too much data to fit in a QR code.');
      /** @type {any} */ (err).usedBits = usedBits;
      /** @type {any} */ (err).capacityBits = capacityBits;
      throw err;
    }
  }
}

/**
 * Segments for text using a single byte-mode run, for comparison against the
 * optimal plan. Used to show the user what optimisation bought them.
 * @param {string} text
 * @returns {object[]}
 */
export function makeByteSegments(text) {
  return text.length === 0 ? [] : [QrSegment.makeBytes(utf8Bytes(text))];
}

export { MODE_NAMES };
