/**
 * Styling, and the physics that constrains it.
 *
 * Every option in here trades appearance against the chance a phone in a badly
 * lit room reads the code on the first try. The job of this module is not to
 * prevent styling. It is to make the cost of each choice a number the interface
 * can show, so nobody finds out after the print run.
 */

/**
 * @typedef {'square'|'rounded'|'dot'} ModuleShape
 * @typedef {'square'|'rounded'|'circle'} EyeShape
 */

/**
 * @typedef {object} LogoSpec
 * @property {string} href Data URL. Never a remote URL: this app makes no
 *   network requests, and an exported SVG that fetched a logo from the internet
 *   would break the moment that host went away.
 * @property {number} sizeRatio Logo box width as a fraction of the code width.
 * @property {number} padding Quiet margin around the logo, in modules.
 * @property {'square'|'circle'} shape
 * @property {string} plate Colour of the plate behind the logo.
 * @property {string} [alt]
 */

/**
 * @typedef {object} StyleSpec
 * @property {string} foreground
 * @property {string} background 'transparent' is allowed, and warned about.
 * @property {ModuleShape} moduleShape
 * @property {EyeShape} eyeFrame
 * @property {EyeShape} eyeBall
 * @property {string} [eyeColor] Defaults to foreground.
 * @property {null | {from: string, to: string, angle: number}} gradient
 * @property {null | LogoSpec} logo
 * @property {number} quietZone Modules of clear space. Clamped to >= 4.
 */

/** @type {StyleSpec} */
export const DEFAULT_STYLE = {
  foreground: '#000000',
  background: '#FFFFFF',
  moduleShape: 'square',
  eyeFrame: 'square',
  eyeBall: 'square',
  eyeColor: undefined,
  gradient: null,
  logo: null,
  quietZone: 4,
};

/* ---------------------------------------------------------------- colour -- */

/**
 * @param {string} hex
 * @returns {{r: number, g: number, b: number} | null}
 */
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * WCAG relative luminance.
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {number}
 */
export function relativeLuminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * WCAG contrast ratio between two colours, 1 to 21.
 * @param {string} a
 * @param {string} b
 * @returns {number|null}
 */
export function contrastRatio(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast thresholds.
 *
 * These are deliberately stricter than the 4.5:1 used for readable text. A
 * scanner is not a reader: it thresholds a camera image taken at an angle, in
 * whatever light the room has, off paper that may be glossy. ISO/IEC 15415
 * grades a printed symbol on reflectance difference rather than on a WCAG
 * ratio, so this is a proxy, not the standard. It is calibrated so that the
 * "good" band comfortably covers real dark-on-light printing, and the scan
 * verification in verify.js is what actually proves a given combination works.
 */
export const CONTRAST = { GOOD: 7, RISKY: 4.5 };

/**
 * @param {StyleSpec} style
 * @returns {{ratio: number|null, level: 'good'|'risky'|'fail'|'unknown', inverted: boolean, message: string|null}}
 */
export function checkContrast(style) {
  const bg = style.background === 'transparent' ? '#FFFFFF' : style.background;
  const fgColors = style.gradient
    ? [style.gradient.from, style.gradient.to]
    : [style.foreground];
  if (style.eyeColor) fgColors.push(style.eyeColor);

  let worst = Infinity;
  for (const c of fgColors) {
    const r = contrastRatio(c, bg);
    if (r === null) return { ratio: null, level: 'unknown', inverted: false, message: 'That colour is not a valid hex value.' };
    worst = Math.min(worst, r);
  }

  const bgRgb = parseHex(bg);
  const fgRgb = parseHex(fgColors[0]);
  const inverted = !!(bgRgb && fgRgb && relativeLuminance(fgRgb) > relativeLuminance(bgRgb));

  /** @type {'good'|'risky'|'fail'} */
  let level = worst >= CONTRAST.GOOD ? 'good' : worst >= CONTRAST.RISKY ? 'risky' : 'fail';

  let message = null;
  if (level === 'fail') {
    message =
      'These two colours are too close together. A camera has to tell the dark squares from the light ones before it can read anything, and at this contrast many phones will not manage it. Darken the pattern or lighten the background.';
  } else if (level === 'risky') {
    message =
      'This contrast is on the low side. It may read fine on a bright screen and fail on a printed label in poor light. Check the scan test below before committing to a print run.';
  }

  if (inverted && level !== 'fail') {
    const invertedNote =
      'This code is light on dark. Phone cameras handle inverted codes, but a share of older dedicated scanners and some in-app browsers only look for dark on light and will not see it at all. If the code is going somewhere you cannot easily reprint, keep it dark on light.';
    message = message ? `${message} ${invertedNote}` : invertedNote;
    if (level === 'good') level = 'risky';
  }

  return { ratio: worst, level, inverted, message };
}

/* ------------------------------------------------------------------ logo -- */

/** Nominal recovery capacity of each level, from ISO/IEC 18004. */
const NOMINAL_RECOVERY = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

/**
 * How much of that budget a logo may spend, as a function of code size.
 *
 * This was a flat 55% until it was measured, and measuring it showed two
 * things. The flat figure was too generous at every level, and the real limit
 * depends strongly on how big the code is.
 *
 * Sweeping logo sizes against the full scan test, the largest coverage that
 * still decoded under all four conditions was:
 *
 *   level   version 1-2    version 3-5    version 8-12
 *   L          3.6%           4.3%            6.0%
 *   M          5.8%           7.6%           11.5%
 *   Q         13.0%          17.1%           18.6%
 *   H         13.0%          17.1%           20.2%
 *
 * The reason for the slope is structural. A QR code splits its data across
 * error-correction blocks and interleaves them, so damage spread over many
 * blocks is recoverable while damage concentrated in one is not. A version 2
 * code has a single block, so a logo in the middle destroys one contiguous run
 * of it, which is the worst case Reed-Solomon can be handed. Larger versions
 * have more blocks and the same blob is shared out between them.
 *
 * So the share ramps from 35% of the nominal budget on the smallest codes to
 * 65% on version 10 and up. Every value it produces sits under the measured
 * limit above with margin to spare, which the sweep test asserts directly.
 *
 * @param {'L'|'M'|'Q'|'H'} ecc
 * @param {number} size Modules per side, excluding the quiet zone.
 * @returns {number} the largest coverage fraction this app will allow
 */
export function logoCeiling(ecc, size) {
  const version = Math.round((size - 17) / 4);
  const share = 0.35 + 0.3 * Math.min(1, Math.max(0, (version - 2) / 8));
  return NOMINAL_RECOVERY[ecc] * share;
}

/**
 * The nominal figures, for copy that needs to explain the trade-off. Not the
 * limit: see logoCeiling for that.
 * @type {Record<string, number>}
 */
export const LOGO_NOMINAL_RECOVERY = NOMINAL_RECOVERY;

/**
 * Fraction of the code's modules a centre logo covers.
 *
 * Measured against the code itself, not the quiet zone, and counting every
 * module the logo box touches even partially, because a partly covered module
 * is an unreadable module.
 *
 * @param {number} size Modules per side, excluding quiet zone.
 * @param {LogoSpec} logo
 * @returns {{coverage: number, modulesCovered: number, boxModules: number}}
 */
export function logoCoverage(size, logo) {
  const boxModules = logo.sizeRatio * size + logo.padding * 2;
  const covered = Math.ceil(boxModules) ** 2;
  const total = size * size;
  return {
    coverage: Math.min(1, covered / total),
    modulesCovered: covered,
    boxModules,
  };
}

/**
 * @param {number} size
 * @param {LogoSpec|null} logo
 * @param {'L'|'M'|'Q'|'H'} ecc
 * @returns {{ok: boolean, coverage: number, ceiling: number, level: 'good'|'risky'|'fail', message: string|null, suggestEcc: 'L'|'M'|'Q'|'H'|null}}
 */
export function checkLogo(size, logo, ecc) {
  if (!logo) return { ok: true, coverage: 0, ceiling: logoCeiling(ecc, size), level: 'good', message: null, suggestEcc: null };

  const { coverage } = logoCoverage(size, logo);
  const ceiling = logoCeiling(ecc, size);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  if (coverage > ceiling) {
    const better = /** @type {('L'|'M'|'Q'|'H')[]} */ (['M', 'Q', 'H']).find(
      (l) => logoCeiling(l, size) >= coverage,
    );
    return {
      ok: false,
      coverage,
      ceiling,
      level: 'fail',
      message: `This logo covers ${pct(coverage)} of the code. At the current correction level the safe limit is ${pct(ceiling)}. ${
        better
          ? `Raising correction to ${better} would allow it, at the cost of a denser code.`
          : 'Make the logo smaller: no correction level covers this much.'
      }`,
      suggestEcc: better ?? null,
    };
  }

  const level = coverage > ceiling * 0.8 ? 'risky' : 'good';
  return {
    ok: true,
    coverage,
    ceiling,
    level,
    message:
      level === 'risky'
        ? `This logo covers ${pct(coverage)} of the code, close to the ${pct(ceiling)} limit. It leaves little room for print defects. Check the scan test.`
        : null,
    suggestEcc: null,
  };
}

/**
 * The correction level a logo of this size needs.
 * @param {number} size
 * @param {LogoSpec} logo
 * @returns {'L'|'M'|'Q'|'H'|null}
 */
export function eccForLogo(size, logo) {
  const { coverage } = logoCoverage(size, logo);
  return /** @type {('L'|'M'|'Q'|'H')[]} */ (['L', 'M', 'Q', 'H']).find((l) => logoCeiling(l, size) >= coverage) ?? null;
}

/**
 * The largest logo a given correction level can carry.
 *
 * Inverts logoCoverage. Coverage is ceil(box)^2 / size^2, so the constraint
 * coverage <= ceiling rearranges to
 *
 *   ceil(box) <= size * sqrt(ceiling)
 *
 * and since ceil(x) <= n exactly when x <= n for integer n, the largest usable
 * box is floor(size * sqrt(ceiling)) modules across, padding included.
 *
 * Returns 0 when even a minimal logo would not fit, which happens on a small
 * code at a low correction level.
 *
 * @param {number} size Modules per side, excluding quiet zone.
 * @param {'L'|'M'|'Q'|'H'} ecc
 * @param {number} padding Quiet margin around the logo, in modules.
 * @returns {number} sizeRatio, as a fraction of the code's width
 */
export function maxLogoRatio(size, ecc, padding = 1) {
  const boxModules = Math.floor(size * Math.sqrt(logoCeiling(ecc, size)));
  return Math.max(0, (boxModules - padding * 2) / size);
}

/**
 * Work out how the code should adapt to a logo.
 *
 * This is the "scale it so the logo does not break it" decision, in one pure
 * function so the interface never has to reason about it.
 *
 * Two levers, in order of preference:
 *
 *   1. Raise the correction level. More redundancy means more covered modules
 *      can be rebuilt. It costs density: the code needs more squares, so at a
 *      fixed printed width every square gets smaller. That trade is worth
 *      making for a logo, but it has to be said out loud rather than happening
 *      behind the user's back.
 *   2. Shrink the logo. Only when even the highest correction level cannot
 *      carry it, because silently dropping to an unreadable code would be the
 *      worst outcome and silently ignoring the request would be the second
 *      worst.
 *
 * The level is never lowered here. Someone who deliberately set a high level
 * keeps it.
 *
 * @param {object} args
 * @param {number} args.size Modules per side, excluding quiet zone.
 * @param {LogoSpec} args.logo The logo as requested.
 * @param {'L'|'M'|'Q'|'H'} args.ecc The level currently selected.
 * @returns {{logo: LogoSpec, ecc: 'L'|'M'|'Q'|'H', raisedEcc: boolean, shrankLogo: boolean, reason: string|null}}
 */
export function planForLogo({ size, logo, ecc }) {
  const order = /** @type {('L'|'M'|'Q'|'H')[]} */ (['L', 'M', 'Q', 'H']);
  // When nothing can carry it, aim at the highest level and shrink to that,
  // which gives the largest logo the code can actually take. Aiming at the
  // current level instead would shrink the logo further than necessary.
  const needed = eccForLogo(size, logo) ?? 'H';

  // The level that can carry this logo, never below the one already chosen.
  const target = order.indexOf(needed) > order.indexOf(ecc) ? needed : ecc;
  const raisedEcc = target !== ecc;

  const allowed = maxLogoRatio(size, target, logo.padding);
  const shrankLogo = logo.sizeRatio > allowed;
  const finalLogo = shrankLogo ? { ...logo, sizeRatio: Math.max(0.05, allowed) } : logo;

  let reason = null;
  if (raisedEcc && shrankLogo) {
    reason = `Correction raised from ${ECC_COPY[ecc].label} to ${ECC_COPY[target].label} and the logo scaled down to ${Math.round(finalLogo.sizeRatio * 100)}% of the code, which is the largest this code can carry and still be read.`;
  } else if (raisedEcc) {
    reason = `Correction raised from ${ECC_COPY[ecc].label} to ${ECC_COPY[target].label} so the squares behind the logo can be rebuilt. The code is denser now, so print it slightly larger.`;
  } else if (shrankLogo) {
    reason = `The logo was scaled down to ${Math.round(finalLogo.sizeRatio * 100)}% of the code. Even at the highest correction level, anything bigger covers more than the code can recover.`;
  }

  return { logo: finalLogo, ecc: target, raisedEcc, shrankLogo, reason };
}

/**
 * Plain-language names for the correction levels, re-exported from encode.js's
 * vocabulary so style.js can write its own messages without importing the
 * encoder. Kept in sync by the test in style.test.js.
 */
const ECC_COPY = {
  L: { label: 'Low' },
  M: { label: 'Medium' },
  Q: { label: 'Quartile' },
  H: { label: 'High' },
};

/* ----------------------------------------------------------------- shape -- */

/**
 * Corner (finder pattern) styling, and a measured constraint on it.
 *
 * A scanner finds a code by looking along scan lines for the 1:1:3:1:1 ratio of
 * dark:light:dark:light:dark that a finder pattern produces. Testing every
 * combination of ring shape and centre shape against 28 payloads showed that
 * the ratio survives only when the two scale together:
 *
 *   square ring  + square centre    28/28 decoded
 *   square ring  + rounded centre   28/28
 *   square ring  + circular centre  16/28   <-- breaks
 *   rounded ring + any centre       28/28
 *   circular ring + square centre    0/28   <-- breaks badly
 *   circular ring + rounded centre  28/28
 *   circular ring + circular centre 28/28
 *
 * The explanation is geometric. Concentric shapes of the same family shrink
 * together away from the centre line, so the ratio holds on every scan line. A
 * constant-width square ring around a centre that shrinks, or the reverse,
 * only gives the right ratio through the exact middle.
 *
 * So the interface offers one corner style that sets both, rather than two
 * controls that can be combined into a code that fails. EYE_PAIRS is that list.
 */
export const EYE_PAIRS = [
  { id: 'square', label: 'Square', frame: 'square', ball: 'square' },
  { id: 'rounded', label: 'Rounded', frame: 'rounded', ball: 'rounded' },
  { id: 'circle', label: 'Circular', frame: 'circle', ball: 'circle' },
];

/** How much of a module's square area each shape actually inks. */
export const SHAPE_DARK_AREA = { square: 1, rounded: 0.93, dot: Math.PI / 4 };

/** @type {Record<ModuleShape, {label: string, note: string, level: 'good'|'risky'}>} */
export const SHAPE_COPY = {
  square: {
    label: 'Square',
    note: 'Full squares. What the standard assumes, and the most reliable thing to print.',
    level: 'good',
  },
  rounded: {
    label: 'Rounded',
    note: 'Softened corners. Inks about 93% of each square, so it holds up well, but on absorbent paper the rounding plus ink spread can start to blur neighbouring squares together.',
    level: 'good',
  },
  dot: {
    label: 'Dots',
    note: 'Circles instead of squares, inking about 79% of each one. Noticeably decorative, and the least tolerant of small print sizes and cheap printers. The corner squares and the alignment line stay solid, because those are what a scanner locks onto first.',
    level: 'risky',
  },
};

/**
 * Clamp a style to the things this app is willing to render, and report what
 * was changed. Nothing here fails silently.
 * @param {Partial<StyleSpec>} style
 * @returns {{style: StyleSpec, adjustments: string[]}}
 */
export function normaliseStyle(style) {
  const out = { ...DEFAULT_STYLE, ...style };
  const adjustments = [];
  if (!Number.isFinite(out.quietZone) || out.quietZone < 4) {
    if (out.quietZone !== undefined && out.quietZone < 4) {
      adjustments.push('The clear border was raised to the 4-square minimum the standard requires.');
    }
    out.quietZone = 4;
  }
  out.quietZone = Math.min(20, Math.round(out.quietZone));
  if (out.logo) {
    const ratio = Math.min(0.4, Math.max(0.05, out.logo.sizeRatio));
    if (ratio !== out.logo.sizeRatio) adjustments.push('The logo size was clamped to a sane range.');
    out.logo = { ...out.logo, sizeRatio: ratio };
  }
  return { style: out, adjustments };
}
