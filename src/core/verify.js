/**
 * Decode your own output before offering it for download.
 *
 * Every other generator hands you a picture and wishes you luck. The anxiety
 * people actually have is "will this work when it is printed", and that
 * question has a cheap, honest answer: render the thing, read it back with a
 * real decoder, and compare byte for byte. Then do it again under conditions
 * that approximate a phone camera and a cheap printer.
 *
 * A pass here is not a promise about every scanner on earth. It is a much
 * stronger statement than any competitor makes, and the limits are stated
 * plainly in the interface rather than buried.
 */

import { rasterize } from './render/rasterize.js';
import { checkContrast, normaliseStyle } from './style.js';

/**
 * jsQR is loaded on demand.
 *
 * It is about 47KB gzipped, which is a third of the whole initial-load budget,
 * and nothing on screen needs it until the first verification runs. Since
 * verification is debounced by a quarter of a second anyway, fetching the
 * decoder in that window costs nothing a user can perceive and keeps it off the
 * critical path to first paint.
 */
let decoderPromise = null;

/** @returns {Promise<(d: Uint8ClampedArray, w: number, h: number, o?: object) => {data: string}|null>} */
function loadDecoder() {
  if (!decoderPromise) {
    decoderPromise = import('jsqr').then(
      (m) => m.default,
      (err) => {
        // Forget the failed attempt, or one flaky moment would leave a
        // permanently rejected promise and every later verification would
        // fail against a network that has long since recovered.
        decoderPromise = null;
        throw err;
      },
    );
  }
  return decoderPromise;
}

/**
 * Hand the main thread back between conditions.
 *
 * Verifying a dense code is a few hundred milliseconds of solid arithmetic,
 * and doing it in one go freezes the tab: the caret stops blinking, scrolling
 * sticks, and on a laptop the fan spins up. Splitting it at the condition
 * boundaries turns one long block into four short ones, which costs nothing in
 * accuracy and is the difference between an app that feels broken and one that
 * does not.
 *
 * scheduler.yield is the purpose-built API where it exists; setTimeout is the
 * fallback everywhere else, including Node.
 */
function yieldToHost() {
  if (typeof scheduler === 'object' && scheduler && typeof scheduler.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Longest edge, in pixels, that any verification raster may have.
 *
 * Without a cap, the "as exported" condition renders a version 40 code at
 * 8 pixels per module, which is a 1,480 pixel image: about two million pixels
 * to blur and then hand to the decoder, four times over. That is both slow and
 * pointless, because nobody photographs a dense code at 8 pixels per module.
 * A version 40 code printed at 30mm has squares 0.16mm across, and a phone
 * camera resolves two or three pixels of each one, so testing a dense code at a
 * lower pixel count is more realistic rather than less.
 *
 * The floor of 3 is never crossed: below that a camera genuinely cannot resolve
 * the grid, and lowering it further would fail codes that are actually fine.
 */
const MAX_RASTER_EDGE = 720;
const MIN_MODULE_PX = 3;

/**
 * @param {number} requested
 * @param {number} totalModules
 * @returns {number}
 */
export function effectiveModulePx(requested, totalModules) {
  const capped = Math.floor(MAX_RASTER_EDGE / Math.max(1, totalModules));
  return Math.max(MIN_MODULE_PX, Math.min(requested, capped));
}

/**
 * @typedef {object} Condition
 * @property {string} id
 * @property {string} label Plain language, for the interface.
 * @property {string} why What real-world situation this stands in for.
 * @property {number} modulePx
 * @property {number} blurModules Gaussian sigma as a fraction of one module.
 * @property {number} noise Peak +/- noise amplitude, 0-255.
 */

/**
 * The conditions every code is tested under.
 *
 * Blur is expressed as a fraction of a module rather than in pixels, because
 * that is the physically meaningful quantity: a camera that smears half a
 * module is in trouble whatever the resolution, and one that smears a tenth of
 * a module is not. Expressing it in pixels made the test harsher at larger
 * module sizes, which is backwards.
 *
 * These numbers are calibrated so that a plain black-on-white code passes all
 * four with margin, and heavy styling that genuinely risks failure does not. A
 * test that a correct code fails is not a safety feature, it is a broken test.
 *
 * @type {Condition[]}
 */
export const CONDITIONS = [
  {
    id: 'clean',
    label: 'As exported',
    why: 'The file you download, read back at full quality.',
    modulePx: 8,
    blurModules: 0,
    noise: 0,
  },
  {
    id: 'small',
    label: 'Small, or far away',
    why: 'A phone reading the code from across a room, or a small label, where each square is only a few camera pixels across.',
    modulePx: 3,
    blurModules: 0.15,
    noise: 0,
  },
  {
    id: 'print',
    label: 'Cheap printing',
    why: 'Ink spread on absorbent paper, plus the speckle a thermal or laser printer leaves.',
    modulePx: 4,
    blurModules: 0.25,
    noise: 18,
  },
  {
    id: 'camera',
    label: 'Phone camera, poor light',
    why: 'A slightly out of focus photo with sensor noise, taken in a dim room.',
    modulePx: 5,
    blurModules: 0.3,
    noise: 28,
  },
];

/**
 * Degradation runs on luminance alone, not on three colour channels.
 *
 * Blur and additive noise are both linear, and so is the luminance a decoder
 * computes from RGB, which means blurring the luminance gives exactly the same
 * answer as blurring red, green and blue and then taking the luminance. Doing
 * it once instead of three times cuts the most expensive step in verification
 * to a third of its cost, with no change to the result.
 *
 * @param {Uint8ClampedArray} rgba
 * @returns {Float32Array}
 */
function toLuminance(rgba) {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }
  return out;
}

/**
 * @param {Float32Array} grey
 * @param {number} width @param {number} height
 * @returns {Uint8ClampedArray}
 */
function luminanceToRgba(grey, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < grey.length; p++, i += 4) {
    const v = grey[p];
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Separable Gaussian blur over a single channel, with a real sigma.
 *
 * An early version stacked three box passes at an integer radius, which rounded
 * a 0.6 pixel blur up to an effective sigma of 1.4 and made every condition far
 * harsher than intended.
 *
 * The inner loop is split into a clamped edge region and an unclamped interior,
 * because the bounds check was costing more than the multiply it guarded.
 *
 * @param {Float32Array} src
 * @param {number} width @param {number} height @param {number} sigma
 * @returns {Float32Array}
 */
function blurLuminance(src, width, height, sigma) {
  if (!(sigma > 0.01)) return src;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = gaussianPass(src, width, height, kernel, radius, true);
  return gaussianPass(tmp, width, height, kernel, radius, false);
}

/**
 * One separable pass over a single channel.
 * @param {Float32Array} src
 * @param {number} width @param {number} height
 * @param {Float32Array} kernel @param {number} radius @param {boolean} horizontal
 * @returns {Float32Array}
 */
function gaussianPass(src, width, height, kernel, radius, horizontal) {
  const out = new Float32Array(src.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const lineStep = horizontal ? width : 1;
  const taps = kernel.length;

  for (let o = 0; o < outer; o++) {
    const base = o * lineStep;

    // Edges: clamp to the border, which is what a camera sees across a uniform
    // quiet zone. Only the first and last `radius` samples need the check.
    const edge = Math.min(radius, inner);
    for (let i = 0; i < inner; i++) {
      if (i >= edge && i < inner - edge) {
        // Interior: every tap is in range, so no clamping at all.
        let acc = 0;
        let p = base + (i - radius) * stride;
        for (let k = 0; k < taps; k++, p += stride) acc += src[p] * kernel[k];
        out[base + i * stride] = acc;
        continue;
      }
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = j_clamp(i + k, inner);
        acc += src[base + j * stride] * kernel[k + radius];
      }
      out[base + i * stride] = acc;
    }
  }
  return out;
}

/** @param {number} v @param {number} limit */
function j_clamp(v, limit) {
  return v < 0 ? 0 : v >= limit ? limit - 1 : v;
}

/**
 * Deterministic pseudo-random noise, so a verification result never changes
 * between two runs of the same input. A flaky pass/fail badge would be worse
 * than no badge.
 * @param {Float32Array} grey
 * @param {number} amplitude
 * @param {number} seed
 */
function addNoiseLuminance(grey, amplitude, seed) {
  if (amplitude <= 0) return grey;
  let s = seed >>> 0;
  for (let i = 0; i < grey.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 16) / 32768 - 1) * amplitude;
    const v = grey[i] + n;
    grey[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return grey;
}

/**
 * @typedef {object} ConditionResult
 * @property {string} id
 * @property {string} label
 * @property {string} why
 * @property {boolean} decoded Something was found.
 * @property {boolean} matched It was exactly the input string.
 * @property {string|null} got
 * @property {number} modulePx
 */

/**
 * @typedef {object} VerifyResult
 * @property {boolean} pass Every condition matched.
 * @property {boolean} cleanPass The undegraded render matched.
 * @property {ConditionResult[]} conditions
 * @property {string[]} failedIds
 * @property {number} ms
 */

/**
 * Render the styled code and read it back under each condition.
 *
 * @param {boolean[][]} matrix
 * @param {number} version
 * @param {string} expected The exact string that was encoded.
 * @param {object} [options]
 * @param {import('./style.js').StyleSpec} [options.style]
 * @param {Condition[]} [options.conditions]
 * @returns {Promise<VerifyResult>}
 */
export async function verify(matrix, version, expected, options = {}) {
  const started = Date.now();
  const jsQR = await loadDecoder();
  const conditions = options.conditions ?? CONDITIONS;
  const { style: normalised } = normaliseStyle(options.style ?? {});
  const quietZone = normalised.quietZone;
  const totalModules = matrix.length + quietZone * 2;

  /*
    Tell the decoder which way round the code is.

    jsQR's default is to try the image as-is and then, if that fails, try it
    inverted. That doubles the cost of every hard case, and it is wasted work
    here: this is our own render, so we already know whether the pattern is dark
    on light or light on dark.

    The modes are not symmetrical, which is worth writing down because the
    obvious guess is wrong. 'onlyInvert' does not mean "this code is inverted";
    measured against both a normal and an inverted render it returns the wrong
    data for each. The pairing that actually works is 'dontInvert' for a normal
    code and 'invertFirst' for an inverted one, and the unicode/style tests pin
    both.
  */
  const inversionAttempts = checkContrast(normalised).inverted ? 'invertFirst' : 'dontInvert';
  /** @type {ConditionResult[]} */
  const results = [];

  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i];
    // Let the page breathe between conditions rather than blocking for the
    // whole run. The first condition starts immediately.
    if (i > 0) await yieldToHost();

    const modulePx = effectiveModulePx(c.modulePx, totalModules);
    const raster = rasterize(matrix, version, { style: options.style, modulePx });

    let data = raster.data;
    if (c.blurModules > 0 || c.noise > 0) {
      let grey = toLuminance(data);
      if (c.blurModules > 0) grey = blurLuminance(grey, raster.width, raster.height, c.blurModules * modulePx);
      if (c.noise > 0) addNoiseLuminance(grey, c.noise, 0x5eed);
      data = luminanceToRgba(grey, raster.width, raster.height);
    }

    let got = null;
    try {
      const found = jsQR(data, raster.width, raster.height, { inversionAttempts });
      got = found ? found.data : null;
    } catch {
      got = null;
    }

    results.push({
      id: c.id,
      label: c.label,
      why: c.why,
      decoded: got !== null,
      matched: got === expected,
      got,
      modulePx,
    });
  }

  const failedIds = results.filter((r) => !r.matched).map((r) => r.id);
  return {
    pass: failedIds.length === 0,
    cleanPass: results.find((r) => r.id === 'clean')?.matched ?? false,
    conditions: results,
    failedIds,
    ms: Date.now() - started,
  };
}

/**
 * Work out which styling choice is responsible for a failure, by re-testing
 * with each suspect choice reverted one at a time. Guessing would be worse
 * than useless here, so this actually measures.
 *
 * @param {boolean[][]} matrix
 * @param {number} version
 * @param {string} expected
 * @param {import('./style.js').StyleSpec} style
 * @returns {Promise<{culprit: string, label: string, revert: Partial<import('./style.js').StyleSpec>}|null>}
 */
export async function findStyleCulprit(matrix, version, expected, style) {
  /** @type {{key: string, label: string, revert: Partial<import('./style.js').StyleSpec>}[]} */
  const suspects = [];

  if (style.logo) suspects.push({ key: 'logo', label: 'the centre logo', revert: { logo: null } });
  if (style.moduleShape !== 'square') {
    suspects.push({ key: 'moduleShape', label: `the ${style.moduleShape} square shape`, revert: { moduleShape: 'square' } });
  }
  if (style.gradient) suspects.push({ key: 'gradient', label: 'the colour gradient', revert: { gradient: null } });
  if (style.foreground !== '#000000' || style.background !== '#FFFFFF') {
    suspects.push({ key: 'colors', label: 'the colours', revert: { foreground: '#000000', background: '#FFFFFF', gradient: null } });
  }
  if (style.eyeFrame !== 'square' || style.eyeBall !== 'square') {
    suspects.push({ key: 'eyes', label: 'the corner square shape', revert: { eyeFrame: 'square', eyeBall: 'square' } });
  }

  for (const s of suspects) {
    await yieldToHost();
    const r = await verify(matrix, version, expected, { style: { ...style, ...s.revert } });
    if (r.pass) return { culprit: s.key, label: s.label, revert: s.revert };
  }
  return null;
}
