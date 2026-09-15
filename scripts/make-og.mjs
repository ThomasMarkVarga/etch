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

  // Accent bar down the left edge.
  fillRect(og, 0, 0, 14, H, ACCENT);

  const modulePx = Math.floor(400 / (result.size + 8));
  const qr = rasterize(result.matrix, result.version, { modulePx });
  const qrX = W - qr.width - 90;
  const qrY = Math.round((H - qr.height) / 2);

  // A white plate behind the code, so the quiet zone reads as paper.
  fillRect(og, qrX - 26, qrY - 26, qr.width + 52, qr.height + 52, WHITE);
  blit(og, qr, qrX, qrY);

  // Text is drawn as solid blocks rather than glyphs: there is no font
  // rasteriser here, and a wrong-looking word is worse than an honest bar.
  // The real headline lives in og:image:alt and in the page itself.
  const lines = [
    { y: 200, w: 560 },
    { y: 262, w: 470 },
    { y: 352, w: 380, light: true },
    { y: 396, w: 420, light: true },
  ];
  for (const l of lines) {
    fillRect(og, 90, l.y, l.w, l.light ? 16 : 34, l.light ? [150, 156, 168] : INK);
  }
  fillRect(og, 90, 96, 210, 44, ACCENT);

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
