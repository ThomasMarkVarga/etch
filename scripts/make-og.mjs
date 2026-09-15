/**
 * Build-time social image and touch icon.
 *
 * Generated rather than hand-drawn, so the QR code shown in the preview is a
 * real, scannable code produced by this app's own encoder. A social card for a
 * QR generator that showed a fake QR code would be a small lie in exactly the
 * place this app is asking to be trusted.
 *
 * Run by `npm run build` before vite. Output: public/og.png, public/apple-touch-icon.png
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encode } from '../src/core/encode.js';
import { rasterize } from '../src/core/render/rasterize.js';
import { verify } from '../src/core/verify.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const SITE = 'https://etch.vibe-coding.fans/';

/* ------------------------------------------------------------- png writer -- */

/**
 * A minimal PNG encoder.
 *
 * PNG needs a zlib stream, and node:zlib provides one, so this is just the
 * chunk framing and the per-scanline filter byte. Pulling in an image library
 * for one flat-colour picture at build time would be the wrong trade.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * @param {Uint8ClampedArray} rgba
 * @param {number} width @param {number} height
 * @returns {Buffer}
 */
function encodePng(rgba, width, height) {
  // Filter type 0 (none) at the start of every scanline.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------------- canvas -- */

function makeCanvas(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function blit(dst, src, x0, y0) {
  for (let y = 0; y < src.height; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      const d = (dy * dst.width + dx) * 4;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = 255;
    }
  }
}

function fillRect(dst, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= dst.height) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= dst.width) continue;
      const d = (y * dst.width + x) * 4;
      dst.data[d] = r;
      dst.data[d + 1] = g;
      dst.data[d + 2] = b;
      dst.data[d + 3] = 255;
    }
  }
}

/* ------------------------------------------------------------------- main -- */

const INK = [17, 20, 26];
const PAPER = [244, 245, 247];
const ACCENT = [67, 56, 202];
const WHITE = [255, 255, 255];
const MUTED = [141, 148, 162];

/** The six decorative hues from tokens.css, used as a motif strip. */
const HUES = [
  [67, 56, 202], [109, 40, 217], [162, 28, 175],
  [3, 105, 161], [21, 94, 117], [15, 118, 110],
];

/*
  A stencil alphabet, drawn as polygons.

  There is no font rasteriser in Node, and adding one to set two lines of
  display type would be a heavy dependency for a build-time image. Instead the
  letters are defined as polygons in a unit box and filled directly. Squared,
  stencil-cut letterforms suit an app whose entire subject is squares on a grid,
  so this reads as a deliberate display face rather than a workaround.

  Coordinates are fractions of the cap height: x from 0 to WIDTH, y from 0 at
  the cap line to 1 at the baseline. STROKE is the stem thickness. Only the
  letters the card actually uses are defined; anything else is skipped rather
  than guessed at, and the assertion below catches a headline that needs a
  glyph nobody has drawn yet.
*/
const STROKE = 0.2;
const WIDTH = 0.62;

/** @param {number} x @param {number} y @param {number} w @param {number} h */
const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

const S = STROKE;
const W = WIDTH;

/** Each glyph is a union of polygons. @type {Record<string, number[][][]>} */
const GLYPHS = {
  B: [
    box(0, 0, S, 1), box(0, 0, W - S * 0.6, S), box(0, (1 - S) / 2, W - S * 0.6, S),
    box(0, 1 - S, W - S * 0.6, S), box(W - S, S, S, (1 - S) / 2 - S), box(W - S, (1 + S) / 2, S, (1 - S) / 2 - S),
  ],
  C: [box(0, 0, W, S), box(0, 0, S, 1), box(0, 1 - S, W, S)],
  E: [box(0, 0, S, 1), box(0, 0, W, S), box(0, (1 - S) / 2, W * 0.82, S), box(0, 1 - S, W, S)],
  H: [box(0, 0, S, 1), box(W - S, 0, S, 1), box(0, (1 - S) / 2, W, S)],
  I: [box((W - S) / 2, 0, S, 1)],
  // The diagonal is a parallelogram from the top of the left stem to the foot
  // of the right one, which is what makes an N an N rather than an H.
  N: [box(0, 0, S, 1), box(W - S, 0, S, 1), [[0, 0], [S, 0], [W, 1], [W - S, 1]]],
  O: [box(0, 0, W, S), box(0, 1 - S, W, S), box(0, 0, S, 1), box(W - S, 0, S, 1)],
  P: [box(0, 0, S, 1), box(0, 0, W, S), box(0, (1 - S) / 2, W, S), box(W - S, S, S, (1 - S) / 2 - S)],
  R: [
    box(0, 0, S, 1), box(0, 0, W, S), box(0, (1 - S) / 2, W, S), box(W - S, S, S, (1 - S) / 2 - S),
    [[W - S * 1.7, (1 + S) / 2], [W - S * 0.7, (1 + S) / 2], [W, 1], [W - S, 1]],
  ],
  T: [box(0, 0, W, S), box((W - S) / 2, 0, S, 1)],
  V: [[[0, 0], [S, 0], [W / 2 + S / 2, 1], [W / 2 - S / 2, 1]], [[W - S, 0], [W, 0], [W / 2 + S / 2, 1], [W / 2 - S / 2, 1]]],
  A: [
    [[0, 1], [S, 1], [W / 2 + S / 2, 0], [W / 2 - S / 2, 0]],
    [[W - S, 1], [W, 1], [W / 2 + S / 2, 0], [W / 2 - S / 2, 0]],
    box(S * 0.55, 0.58, W - S * 1.1, S * 0.9),
  ],
  F: [box(0, 0, S, 1), box(0, 0, W, S), box(0, (1 - S) / 2, W * 0.82, S)],
  K: [
    box(0, 0, S, 1),
    [[W - S, 0], [W, 0], [S + S * 0.9, 0.52], [S, 0.52]],
    [[S, 0.48], [S + S * 0.9, 0.48], [W, 1], [W - S, 1]],
  ],
  M: [
    box(0, 0, S, 1), box(W * 1.18 - S, 0, S, 1),
    [[0, 0], [S, 0], [W * 0.59 + S / 2, 0.72], [W * 0.59 - S / 2, 0.72]],
    [[W * 1.18 - S, 0], [W * 1.18, 0], [W * 0.59 + S / 2, 0.72], [W * 0.59 - S / 2, 0.72]],
  ],
  '.': [box(0, 1 - S, S, S)],
  ' ': [],
};

/** Advance width of each glyph, as a fraction of cap height. */
const ADVANCE = { '.': STROKE * 1.6, ' ': WIDTH * 0.55, M: WIDTH * 1.18 };
const TRACKING = 0.17;

/**
 * Width a string will occupy at a given cap height.
 * @param {string} text @param {number} h
 */
function measure(text, h) {
  let total = 0;
  for (const ch of text) total += (ADVANCE[ch] ?? WIDTH) * h + TRACKING * h;
  return total - TRACKING * h;
}

/**
 * Draw a string, anti-aliased.
 *
 * The diagonals in N, R and V would be visibly jagged filled at device
 * resolution, so coverage is sampled on a 3x3 subpixel grid and composited,
 * the same approach the app's own rasteriser uses for dot-style modules.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} dst
 * @param {string} text
 * @param {number} x @param {number} y cap-line origin, in pixels
 * @param {number} h cap height in pixels
 * @param {[number, number, number]} colour
 * @returns {number} x just past the final glyph
 */
function drawText(dst, text, x, y, h, colour) {
  const polys = [];
  let cursor = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch.toUpperCase()];
    if (glyph === undefined) throw new Error(`No stencil glyph for ${JSON.stringify(ch)}. Add one to GLYPHS.`);
    for (const poly of glyph) polys.push(poly.map(([px, py]) => [cursor + px * h, y + py * h]));
    cursor += (ADVANCE[ch] ?? WIDTH) * h + TRACKING * h;
  }
  fillPolygons(dst, polys, colour);
  return cursor - TRACKING * h;
}

/**
 * Even-odd point-in-polygon test.
 * @param {number[][]} poly @param {number} px @param {number} py
 */
function inPolygon(poly, px, py) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Fill the union of polygons with 3x3 supersampled coverage.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} dst
 * @param {number[][][]} polys
 * @param {[number, number, number]} colour
 */
function fillPolygons(dst, polys, [r, g, b]) {
  if (polys.length === 0) return;
  const SS = 3;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const [px, py] of poly) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(dst.width, Math.ceil(maxX) + 1);
  const y1 = Math.min(dst.height, Math.ceil(maxY) + 1);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        const fy = py + (sy + 0.5) / SS;
        for (let sx = 0; sx < SS; sx++) {
          const fx = px + (sx + 0.5) / SS;
          for (const poly of polys) {
            if (inPolygon(poly, fx, fy)) { hits++; break; }
          }
        }
      }
      if (!hits) continue;
      const a = hits / (SS * SS);
      const o = (py * dst.width + px) * 4;
      dst.data[o] = dst.data[o] * (1 - a) + r * a;
      dst.data[o + 1] = dst.data[o + 1] * (1 - a) + g * a;
      dst.data[o + 2] = dst.data[o + 2] * (1 - a) + b * a;
      dst.data[o + 3] = 255;
    }
  }
}

// A real code for the real site, verified before it is written to disk.
const result = encode(SITE, { ecc: 'Q' });
const check = await verify(result.matrix, result.version, SITE);
if (!check.pass) {
  throw new Error(`The code for the social image does not decode: ${check.failedIds.join(', ')}`);
}

/* og.png, 1200x630 */
{
  const W = 1200;
  const H = 630;
  const og = makeCanvas(W, H, PAPER);

  // Accent spine down the left edge, the same device the explainer cards use.
  fillRect(og, 0, 0, 16, H, ACCENT);

  // The code, right-hand side: a real one for the real site, verified above.
  const modulePx = Math.floor(300 / (result.size + 8));
  const qr = rasterize(result.matrix, result.version, { modulePx });
  const qrX = W - qr.width - 92;
  const qrY = Math.round((H - qr.height) / 2);
  fillRect(og, qrX - 26, qrY - 26, qr.width + 52, qr.height + 52, WHITE);
  blit(og, qr, qrX, qrY);

  const left = 96;

  // Wordmark, small, above the headline.
  const markTop = 134;
  const markEnd = drawText(og, 'ETCH', left, markTop, 46, INK);
  fillRect(og, Math.round(markEnd + 10), markTop + 46 - 9, 9, 9, ACCENT);

  /*
    The headline. A social card gets about one second of attention, and the
    validators are right that a card with no readable claim on it is a wasted
    slot, so the promise goes in the image rather than relying on the
    description text beside it.
  */
  const headline = 60;
  drawText(og, 'PRINT ONCE.', left, 236, headline, INK);
  drawText(og, 'NEVER REPRINT.', left, 326, headline, ACCENT);

  /*
    A call to action, in a filled block.

    The palette strip that used to sit here was decoration. A social card has
    one job, and a validator is right to want something on it that tells you
    what to do, not just what the thing is called.
  */
  const ctaText = 'MAKE ONE FREE';
  const ctaCap = 30;
  const ctaPadX = 30;
  const ctaPadY = 22;
  const ctaW = Math.round(measure(ctaText, ctaCap) + ctaPadX * 2);
  const ctaH = ctaCap + ctaPadY * 2;
  const ctaY = 452;
  fillRect(og, left, ctaY, ctaW, ctaH, ACCENT);
  drawText(og, ctaText, left + ctaPadX, ctaY + ctaPadY, ctaCap, WHITE);

  // The palette keeps a smaller role beside the button, as a colour signature
  // rather than the main event.
  HUES.forEach((hue, i) => fillRect(og, left + ctaW + 34 + i * 30, ctaY + ctaH / 2 - 10, 20, 20, hue));

  await writeFile(join(publicDir, 'og.png'), encodePng(og.data, W, H));
  console.log(`og.png written (1200x630, code version ${result.version}, verified)`);
}

/* apple-touch-icon.png, 180x180 */
{
  const S = 180;
  const icon = makeCanvas(S, S, ACCENT);
  // The finder pattern: the one shape everyone reads as "QR code".
  const u = 18;
  fillRect(icon, 2 * u, 2 * u, 4 * u, 4 * u, WHITE);
  fillRect(icon, 2 * u + 10, 2 * u + 10, 4 * u - 20, 4 * u - 20, ACCENT);
  fillRect(icon, 3 * u, 3 * u, 2 * u, 2 * u, WHITE);
  fillRect(icon, 7 * u, 2 * u, u, u, WHITE);
  fillRect(icon, 2 * u, 7 * u, u, u, WHITE);
  fillRect(icon, 7 * u, 6 * u, u, 2 * u, WHITE);
  fillRect(icon, 5 * u, 7 * u, u, u, WHITE);
  await writeFile(join(publicDir, 'apple-touch-icon.png'), encodePng(icon.data, S, S));
  console.log('apple-touch-icon.png written (180x180)');
}
