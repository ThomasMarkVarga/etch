/**
 * Build-time social image and touch icon.
 *
 * The QR code on the card is real: produced by this app's own encoder, styled
 * in the brand indigo with the Etch mark at its centre, and put through the
 * app's own four-condition scan test before the file is written. Both the
 * colour and the logo are choices the app warns users about, so both are
 * checked here rather than assumed. A social card for a QR generator showing a
 * code that does not scan would be making exactly the mistake it exists to
 * prevent.
 *
 * Drawing primitives, the stencil alphabet and the mark live in lib/draw.mjs,
 * shared with make-wall-gif.mjs so the card and the animated preview cannot
 * drift apart.
 *
 * Run by `npm run build` before vite.
 * Output: public/og.png, public/apple-touch-icon.png
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encode } from '../src/core/encode.js';
import { rasterize } from '../src/core/render/rasterize.js';
import { verify } from '../src/core/verify.js';
import { normaliseStyle, checkContrast, checkLogo } from '../src/core/style.js';
import { encodePng } from './lib/png.mjs';
import {
  makeCanvas, fillRect, blit, drawText, measure, drawMark,
  INK, PAPER, WHITE, ACCENT, HUES,
} from './lib/draw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const SITE = 'https://etch.vibe-coding.fans/';
const INDIGO = '#4338CA';
const LOGO_RATIO = 0.2;


/**
 * Decode the pixels that actually ship.
 *
 * verify() above checks a model of the code, in which the logo area is treated
 * as lost. This reads the composed image back instead, mark and all, so what is
 * asserted is the thing in the file rather than a description of it.
 *
 * @param {{data: Uint8ClampedArray, width: number}} canvas
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} expected
 */
async function assertRegionDecodes(canvas, x, y, w, h, expected) {
  const { default: jsQR } = await import('jsqr');
  const region = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * canvas.width + x) * 4;
    region.set(canvas.data.subarray(from, from + w * 4), row * w * 4);
  }
  const found = jsQR(region, w, h, { inversionAttempts: 'dontInvert' });
  if (!found || found.data !== expected) {
    throw new Error(`The composed image does not decode to ${expected}: got ${JSON.stringify(found?.data ?? null)}`);
  }
  return found.data;
}

/* -------------------------------------------------------------- the code -- */

const result = encode(SITE, { ecc: 'Q', boostEcc: false });

const { style } = normaliseStyle({
  foreground: INDIGO,
  background: '#FFFFFF',
  logo: { href: '', sizeRatio: LOGO_RATIO, padding: 1, shape: 'square', plate: '#FFFFFF' },
});

const contrast = checkContrast(style);
if (contrast.level === 'fail') throw new Error(`Indigo on white failed the contrast check: ${contrast.message}`);

const logoCheck = checkLogo(result.size, style.logo, result.ecc);
if (!logoCheck.ok) throw new Error(`The centre mark is too large: ${logoCheck.message}`);

const check = await verify(result.matrix, result.version, SITE, { style });
if (!check.pass) {
  throw new Error(`The code for the social image does not decode under: ${check.failedIds.join(', ')}`);
}

/* ---------------------------------------------------------------- og.png -- */

{
  const W = 1200;
  const H = 630;
  const og = makeCanvas(W, H, PAPER);

  // Accent spine down the left edge, the same device the explainer cards use.
  fillRect(og, 0, 0, 16, H, ACCENT);

  const modulePx = Math.max(1, Math.round(392 / (result.size + 8)));
  const qr = rasterize(result.matrix, result.version, { style, modulePx });
  const qrX = W - qr.width - 96;
  const qrY = Math.round((H - qr.height) / 2);

  // White plate behind it, so the quiet zone reads as paper against the page.
  fillRect(og, qrX - 30, qrY - 30, qr.width + 60, qr.height + 60, WHITE);
  blit(og, qr, qrX, qrY);

  // The mark, over the area the rasteriser already cleared for it.
  const markSize = result.size * LOGO_RATIO * modulePx;
  drawMark(og, qrX + qr.width / 2 - markSize / 2, qrY + qr.height / 2 - markSize / 2, markSize, ACCENT, WHITE);

  const left = 96;

  // Wordmark, small, above the headline.
  const markTop = 134;
  const markEnd = drawText(og, 'ETCH', left, markTop, 46, INK);
  fillRect(og, Math.round(markEnd + 10), markTop + 46 - 9, 9, 9, ACCENT);

  /*
    The headline. A social card gets about one second of attention, and a
    validator is right that a card with no readable claim on it is a wasted
    slot, so the promise goes in the image rather than relying on the
    description text beside it.
  */
  const headline = 47;
  const lineOne = 'GENERATE, PRINT,';
  const lineTwo = 'NEVER REPRINT.';

  // The headline must not run under the code's white plate.
  const room = qrX - 30 - left - 24;
  for (const line of [lineOne, lineTwo]) {
    const w = measure(line, headline);
    if (w > room) throw new Error(`Headline "${line}" is ${Math.round(w)}px wide, ${Math.round(room)}px available.`);
  }

  drawText(og, lineOne, left, 236, headline, INK);
  drawText(og, lineTwo, left, 326, headline, ACCENT);

  /*
    No call-to-action button. An earlier version had one and it came out: the
    card is an image, nothing inside it is clickable, and a block that looks
    like a button invites a tap that does nothing. The whole card is the link.
  */
  HUES.forEach((hue, i) => fillRect(og, left + i * 52, 458, 36, 36, hue));

  // The real gate: read the finished artwork back.
  const decoded = await assertRegionDecodes(og, qrX - 30, qrY - 30, qr.width + 60, qr.height + 60, SITE);

  await writeFile(join(publicDir, 'og.png'), encodePng(og.data, W, H));
  console.log(`og.png written (1200x630, version ${result.version}, indigo with centre mark)`);
  console.log(`composed image decodes to: ${decoded}`);
}

/* ---------------------------------------------- apple-touch-icon.png, 180 -- */

{
  const S = 180;
  const icon = makeCanvas(S, S, ACCENT);
  drawMark(icon, 0, 0, S, ACCENT, WHITE);
  await writeFile(join(publicDir, 'apple-touch-icon.png'), encodePng(icon.data, S, S));
  console.log('apple-touch-icon.png written (180x180)');
}

/* ------------------------------------ favicon-96.png and favicon.ico, 48 -- */

// Search results take a site's icon from a raster favicon of 48px or a multiple of it; the SVG alone is not used.
{
  const draw = (S) => {
    const icon = makeCanvas(S, S, ACCENT);
    drawMark(icon, 0, 0, S, ACCENT, WHITE);
    return encodePng(icon.data, S, S);
  };
  await writeFile(join(publicDir, 'favicon-96.png'), draw(96));
  // An ICO holding one PNG: a 6 byte header, one 16 byte directory entry, then the image itself.
  const png = draw(48);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(48, 6);
  head.writeUInt8(48, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  await writeFile(join(publicDir, 'favicon.ico'), Buffer.concat([head, png]));
  console.log('favicon-96.png and favicon.ico written (96x96, 48x48)');
}

console.log(`scan test: ${check.conditions.map((c) => `${c.id} ${c.matched ? 'ok' : 'FAIL'}`).join(', ')}`);
console.log(`logo covers ${(logoCheck.coverage * 100).toFixed(1)}% of ${(logoCheck.ceiling * 100).toFixed(1)}% allowed`);
