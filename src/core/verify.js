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
  if (!decoderPromise) decoderPromise = import('jsqr').then((m) => m.default);
  return decoderPromise;
}

/**
 * Start fetching the decoder without waiting for it, so the first verification
 * does not also pay for the download.
 */
export function warmDecoder() {
  loadDecoder().catch(() => {
    decoderPromise = null;
  });
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
 * Separable Gaussian blur with a real floating-point sigma.
 *
 * An earlier version stacked three box passes at an integer radius, which
 * rounded a 0.6 pixel blur up to an effective sigma of 1.4 and made every
 * condition far harsher than intended.
 *
 * @param {Uint8ClampedArray} data RGBA
 * @param {number} width
 * @param {number} height
 * @param {number} sigma
 */
function blurRgba(data, width, height, sigma) {
  if (!(sigma > 0.01)) return data;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const pass1 = gaussianPass(data, width, height, kernel, radius, true);
  return gaussianPass(pass1, width, height, kernel, radius, false);
}

/**
 * @param {Uint8ClampedArray} src
 * @param {number} width @param {number} height
 * @param {Float32Array} kernel @param {number} radius @param {boolean} horizontal
 */
function gaussianPass(src, width, height, kernel, radius, horizontal) {
  const out = new Uint8ClampedArray(src.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const stride = horizontal ? 4 : width * 4;
  const lineStep = horizontal ? width * 4 : 4;

  for (let o = 0; o < outer; o++) {
    const base = o * lineStep;
    for (let i = 0; i < inner; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        // Clamp at the edges: the quiet zone is uniform, so this matches what
        // a camera sees rather than darkening the border.
        const j = Math.min(inner - 1, Math.max(0, i + k));
        const w = kernel[k + radius];
        const p = base + j * stride;
        r += src[p] * w;
        g += src[p + 1] * w;
        b += src[p + 2] * w;
      }
      const p = base + i * stride;
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = 255;
    }
  }
  return out;
}

/**
 * Deterministic pseudo-random noise, so a verification result never changes
 * between two runs of the same input. A flaky pass/fail badge would be worse
 * than no badge.
 * @param {Uint8ClampedArray} data
 * @param {number} amplitude
 * @param {number} seed
 */
function addNoise(data, amplitude, seed) {
  if (amplitude <= 0) return data;
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 16) / 32768 - 1) * amplitude;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  return data;
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
  /** @type {ConditionResult[]} */
  const results = [];

  for (const c of conditions) {
    const raster = rasterize(matrix, version, { style: options.style, modulePx: c.modulePx });
    let data = raster.data;
    if (c.blurModules > 0) data = blurRgba(data, raster.width, raster.height, c.blurModules * c.modulePx);
    if (c.noise > 0) data = addNoise(data, c.noise, 0x5eed);

    let got = null;
    try {
      const found = jsQR(data, raster.width, raster.height, { inversionAttempts: 'attemptBoth' });
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
      modulePx: c.modulePx,
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
    const r = await verify(matrix, version, expected, { style: { ...style, ...s.revert } });
    if (r.pass) return { culprit: s.key, label: s.label, revert: s.revert };
  }
  return null;
}
