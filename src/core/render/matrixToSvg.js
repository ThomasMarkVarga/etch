/**
 * SVG rendering.
 *
 * Output is vector, in module units, with the dark modules merged into as few
 * path commands as possible. One <rect> per module is what most generators
 * emit; for a version 10 code that is roughly 1,500 elements, which bloats the
 * file and gives a print shop's RIP far more work than it needs. Merging
 * contiguous modules into maximal rectangles typically cuts that by 60-70% and
 * produces identical geometry.
 */

import { classifyModules, isStructural, finderOrigins } from '../patterns.js';
import { normaliseStyle } from '../style.js';

/**
 * Greedy maximal-rectangle decomposition of a boolean grid.
 *
 * For each unclaimed dark module, extend as far right as possible, then as far
 * down as every column in that run stays dark. Not the provably minimal
 * decomposition, which is a much harder problem, but it collapses the large
 * solid blocks that dominate a QR code and runs in a fraction of a millisecond.
 *
 * @param {(x: number, y: number) => boolean} isDark
 * @param {number} size
 * @returns {{x: number, y: number, w: number, h: number}[]}
 */
export function mergeRectangles(isDark, size) {
  const used = Array.from({ length: size }, () => new Uint8Array(size));
  const rects = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (used[y][x] || !isDark(x, y)) continue;

      let w = 1;
      while (x + w < size && !used[y][x + w] && isDark(x + w, y)) w++;

      let h = 1;
      grow: while (y + h < size) {
        for (let i = 0; i < w; i++) {
          if (used[y + h][x + i] || !isDark(x + i, y + h)) break grow;
        }
        h++;
      }

      for (let j = 0; j < h; j++) used[y + j].fill(1, x, x + w);
      rects.push({ x, y, w, h });
    }
  }
  return rects;
}

/** @param {number} n */
const num = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return String(r);
};

/**
 * Path data for a set of merged rectangles.
 * @param {{x: number, y: number, w: number, h: number}[]} rects
 * @param {number} offset Quiet zone offset in modules.
 * @returns {string}
 */
function rectsToPath(rects, offset) {
  let d = '';
  for (const { x, y, w, h } of rects) {
    d += `M${num(x + offset)} ${num(y + offset)}h${num(w)}v${num(h)}h${num(-w)}z`;
  }
  return d;
}

/**
 * Path data for a rounded rectangle.
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${num(x + rr)} ${num(y)}` +
    `h${num(w - 2 * rr)}a${num(rr)} ${num(rr)} 0 0 1 ${num(rr)} ${num(rr)}` +
    `v${num(h - 2 * rr)}a${num(rr)} ${num(rr)} 0 0 1 ${num(-rr)} ${num(rr)}` +
    `h${num(-(w - 2 * rr))}a${num(rr)} ${num(rr)} 0 0 1 ${num(-rr)} ${num(-rr)}` +
    `v${num(-(h - 2 * rr))}a${num(rr)} ${num(rr)} 0 0 1 ${num(rr)} ${num(-rr)}z`
  );
}

/** Circle as two arcs, so everything stays in one path element. */
function circlePath(cx, cy, r) {
  return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(r * 2)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-r * 2)} 0z`;
}

/**
 * Horizontal runs of dark modules, used by the rounded style so a run of
 * neighbours becomes one capsule rather than a row of separate pills. This
 * keeps more ink on the page than rounding each module individually.
 * @param {(x: number, y: number) => boolean} isDark
 * @param {number} size
 */
function horizontalRuns(isDark, size) {
  const runs = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!isDark(x, y)) { x++; continue; }
      let w = 1;
      while (x + w < size && isDark(x + w, y)) w++;
      runs.push({ x, y, w });
      x += w;
    }
  }
  return runs;
}

/**
 * Eye (finder pattern) path: a 7x7 frame with a 3x3 centre.
 * @param {{x: number, y: number}} origin
 * @param {number} offset
 * @param {import('../style.js').EyeShape} frame
 * @param {import('../style.js').EyeShape} ball
 */
function eyePath(origin, offset, frame, ball) {
  const x = origin.x + offset;
  const y = origin.y + offset;
  let d = '';

  // Frame: 7x7 outer minus 5x5 inner, drawn as two subpaths. The even-odd fill
  // rule punches the hole, which keeps the one-module-thick ring exact.
  if (frame === 'circle') {
    d += circlePath(x + 3.5, y + 3.5, 3.5);
    d += circlePath(x + 3.5, y + 3.5, 2.5);
  } else if (frame === 'rounded') {
    d += roundedRectPath(x, y, 7, 7, 2);
    d += roundedRectPath(x + 1, y + 1, 5, 5, 1.4);
  } else {
    d += `M${num(x)} ${num(y)}h7v7h-7z`;
    d += `M${num(x + 1)} ${num(y + 1)}h5v5h-5z`;
  }

  // Centre 3x3.
  if (ball === 'circle') d += circlePath(x + 3.5, y + 3.5, 1.5);
  else if (ball === 'rounded') d += roundedRectPath(x + 2, y + 2, 3, 3, 0.9);
  else d += `M${num(x + 2)} ${num(y + 2)}h3v3h-3z`;

  return d;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * @typedef {object} SvgOptions
 * @property {import('../style.js').StyleSpec} [style]
 * @property {string} [title] Accessible name, written into <title>.
 * @property {string} [desc] Longer description, written into <desc>.
 * @property {number} [pixelSize] width/height attributes in px.
 * @property {number} [widthMm] width/height attributes in mm. Takes precedence.
 * @property {string} [idPrefix] Namespacing for gradient ids, so several codes
 *   can share one page without their defs colliding.
 */

/**
 * @typedef {object} SvgResult
 * @property {string} svg
 * @property {number} totalModules Modules per side, including quiet zone.
 * @property {number} rectCount Paths after merging.
 * @property {number} naiveRectCount One per dark module, for comparison.
 */

/**
 * Render a module matrix to an SVG string.
 *
 * @param {boolean[][]} matrix Row-major, true = dark, no quiet zone.
 * @param {number} version
 * @param {SvgOptions} [options]
 * @returns {SvgResult}
 */
export function matrixToSvg(matrix, version, options = {}) {
  const { style } = normaliseStyle(options.style ?? {});
  const size = matrix.length;
  const qz = style.quietZone;
  const total = size + qz * 2;
  const roles = classifyModules(version);
  const idPrefix = options.idPrefix ?? 'etch';

  const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && matrix[y][x];
  const isEye = (x, y) => roles[y][x] === 'finder';

  // Data modules take the chosen shape; structural modules keep full squares so
  // the scanner's reference geometry is never weakened by a styling choice.
  const shapedDark = (x, y) => dark(x, y) && !isEye(x, y) && !(style.moduleShape !== 'square' && isStructural(roles[y][x]));
  const solidDark = (x, y) =>
    dark(x, y) && !isEye(x, y) && style.moduleShape !== 'square' && isStructural(roles[y][x]);

  let d = '';
  let rectCount = 0;

  if (style.moduleShape === 'square') {
    const rects = mergeRectangles((x, y) => dark(x, y) && !isEye(x, y), size);
    d += rectsToPath(rects, qz);
    rectCount = rects.length;
  } else {
    // Structural modules first, merged, still square.
    const solid = mergeRectangles(solidDark, size);
    d += rectsToPath(solid, qz);
    rectCount += solid.length;

    if (style.moduleShape === 'rounded') {
      const runs = horizontalRuns(shapedDark, size);
      for (const r of runs) d += roundedRectPath(r.x + qz, r.y + qz, r.w, 1, 0.34);
      rectCount += runs.length;
    } else {
      const radius = 0.5 * Math.sqrt(0.79); // keeps ~79% of the square's area
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!shapedDark(x, y)) continue;
          d += circlePath(x + qz + 0.5, y + qz + 0.5, radius);
          rectCount++;
        }
      }
    }
  }

  let eyeD = '';
  for (const origin of finderOrigins(size)) {
    eyeD += eyePath(origin, qz, style.eyeFrame, style.eyeBall);
  }

  let naiveRectCount = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (matrix[y][x]) naiveRectCount++;

  const gradId = `${idPrefix}-grad`;
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;

  const fill = style.gradient ? `url(#${gradId})` : style.foreground;
  const eyeFill = style.eyeColor ?? fill;

  let defs = '';
  if (style.gradient) {
    const a = ((style.gradient.angle ?? 45) * Math.PI) / 180;
    const x1 = 0.5 - Math.cos(a) / 2;
    const y1 = 0.5 - Math.sin(a) / 2;
    const x2 = 0.5 + Math.cos(a) / 2;
    const y2 = 0.5 + Math.sin(a) / 2;
    defs +=
      `<linearGradient id="${gradId}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}">` +
      `<stop offset="0" stop-color="${esc(style.gradient.from)}"/>` +
      `<stop offset="1" stop-color="${esc(style.gradient.to)}"/>` +
      `</linearGradient>`;
  }

  let logoEl = '';
  if (style.logo) {
    const boxW = style.logo.sizeRatio * size;
    const plate = boxW + style.logo.padding * 2;
    const cx = qz + size / 2;
    const px = cx - plate / 2;
    const py = cx - plate / 2;
    const plateEl =
      style.logo.shape === 'circle'
        ? `<circle cx="${num(cx)}" cy="${num(cx)}" r="${num(plate / 2)}" fill="${esc(style.logo.plate)}"/>`
        : `<rect x="${num(px)}" y="${num(py)}" width="${num(plate)}" height="${num(plate)}" rx="${num(plate * 0.12)}" fill="${esc(style.logo.plate)}"/>`;
    logoEl =
      `<g aria-hidden="true">${plateEl}` +
      `<image x="${num(cx - boxW / 2)}" y="${num(cx - boxW / 2)}" width="${num(boxW)}" height="${num(boxW)}" ` +
      `preserveAspectRatio="xMidYMid meet" href="${esc(style.logo.href)}"/></g>`;
  }

  const dims = options.widthMm
    ? ` width="${num(options.widthMm)}mm" height="${num(options.widthMm)}mm"`
    : options.pixelSize
      ? ` width="${Math.round(options.pixelSize)}" height="${Math.round(options.pixelSize)}"`
      : '';

  const title = options.title ?? 'QR code';
  const desc =
    options.desc ??
    `Static QR code, version ${version}, ${size} by ${size} squares plus a ${qz}-square clear border.`;

  const bg =
    style.background === 'transparent'
      ? ''
      : `<rect width="${total}" height="${total}" fill="${esc(style.background)}"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dims} ` +
    `role="img" aria-labelledby="${titleId} ${descId}" shape-rendering="crispEdges">` +
    `<title id="${titleId}">${esc(title)}</title>` +
    `<desc id="${descId}">${esc(desc)}</desc>` +
    (defs ? `<defs>${defs}</defs>` : '') +
    bg +
    (d ? `<path fill="${esc(fill)}" fill-rule="evenodd" d="${d}"/>` : '') +
    (eyeD ? `<path fill="${esc(eyeFill)}" fill-rule="evenodd" d="${eyeD}"/>` : '') +
    logoEl +
    `</svg>`;

  return { svg, totalModules: total, rectCount: rectCount + 3, naiveRectCount };
}

/**
 * Reconstruct a boolean matrix from merged rectangles. Used by the test that
 * proves merging is lossless.
 * @param {{x: number, y: number, w: number, h: number}[]} rects
 * @param {number} size
 * @returns {boolean[][]}
 */
export function rectsToMatrix(rects, size) {
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const { x, y, w, h } of rects) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[y + j][x + i] = true;
  }
  return m;
}
