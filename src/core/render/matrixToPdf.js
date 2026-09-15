/**
 * Print-ready PDF, at real physical dimensions.
 *
 * Lazy-loaded: pdf-lib is large and most people download an SVG and never come
 * here. Vector, not a raster image on a page, so a print shop's workflow can
 * scale it without asking anyone for a higher-resolution file.
 *
 * The page is sized to the code plus any bleed, rather than being an A4 sheet
 * with a small code floating on it, because what a printer wants is artwork at
 * final size.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { classifyModules, isStructural, finderOrigins } from '../patterns.js';
import { normaliseStyle, parseHex } from '../style.js';
import { mergeRectangles } from './matrixToSvg.js';

/** PDF works in points: 72 per inch. */
const PT_PER_MM = 72 / 25.4;

/** @param {string} hex @param {[number,number,number]} fallback */
function toRgb(hex, fallback = [0, 0, 0]) {
  const c = parseHex(hex);
  if (!c) return rgb(fallback[0], fallback[1], fallback[2]);
  return rgb(c.r / 255, c.g / 255, c.b / 255);
}

/**
 * @typedef {object} PdfOptions
 * @property {import('../style.js').StyleSpec} [style]
 * @property {number} widthMm Total width including the quiet zone.
 * @property {number} [bleedMm] Extra background beyond the trim edge.
 * @property {boolean} [cropMarks]
 * @property {string} [title]
 * @property {string} [payloadType]
 * @property {boolean} [caption] Print the size under the code, off by default.
 */

/**
 * @param {boolean[][]} matrix
 * @param {number} version
 * @param {PdfOptions} options
 * @returns {Promise<Uint8Array>}
 */
export async function matrixToPdf(matrix, version, options) {
  const { style } = normaliseStyle(options.style ?? {});
  const widthMm = Math.max(5, options.widthMm);
  const bleedMm = options.bleedMm ?? 0;
  const cropMarks = !!options.cropMarks;

  const size = matrix.length;
  const qz = style.quietZone;
  const total = size + qz * 2;

  const modulePt = (widthMm * PT_PER_MM) / total;
  const codePt = modulePt * total;
  const bleedPt = bleedMm * PT_PER_MM;
  // Crop marks sit outside the bleed and need room of their own.
  const markPt = cropMarks ? 8 : 0;
  const pagePt = codePt + (bleedPt + markPt) * 2;

  const doc = await PDFDocument.create();
  doc.setTitle(options.title ?? 'QR code');
  doc.setSubject(
    `Static QR code, version ${version}, ${size} by ${size} modules, ${widthMm}mm wide including a ${qz}-module quiet zone.`,
  );
  doc.setCreator('Etch');
  doc.setProducer('Etch (etch.vibe-coding.fans)');
  doc.setKeywords(['QR', 'static', options.payloadType ?? 'code']);

  const page = doc.addPage([pagePt, pagePt]);

  const origin = bleedPt + markPt;
  const bgColor = style.background === 'transparent' ? null : toRgb(style.background, [1, 1, 1]);

  // Background covers the bleed area too, so trimming inside the bleed never
  // exposes white paper at the edge of a dark code.
  if (bgColor) {
    page.drawRectangle({
      x: markPt,
      y: markPt,
      width: pagePt - markPt * 2,
      height: pagePt - markPt * 2,
      color: bgColor,
    });
  }

  const fg = toRgb(style.gradient ? style.gradient.from : style.foreground, [0, 0, 0]);
  const eyeColor = style.eyeColor ? toRgb(style.eyeColor, [0, 0, 0]) : fg;
  const roles = classifyModules(version);

  // PDF's y axis points up, so a module at matrix row y sits this far up.
  const yFor = (my) => origin + codePt - (my + 1) * modulePt;

  const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && matrix[y][x];
  const isEye = (x, y) => roles[y][x] === 'finder';
  const shaped = (x, y) => style.moduleShape !== 'square' && !isStructural(roles[y][x]);

  if (style.moduleShape === 'square') {
    for (const r of mergeRectangles((x, y) => dark(x, y) && !isEye(x, y), size)) {
      page.drawRectangle({
        x: origin + r.x * modulePt,
        y: yFor(r.y + r.h - 1),
        width: r.w * modulePt,
        height: r.h * modulePt,
        color: fg,
      });
    }
  } else {
    for (const r of mergeRectangles((x, y) => dark(x, y) && !isEye(x, y) && !shaped(x, y), size)) {
      page.drawRectangle({
        x: origin + r.x * modulePt,
        y: yFor(r.y + r.h - 1),
        width: r.w * modulePt,
        height: r.h * modulePt,
        color: fg,
      });
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!dark(x, y) || isEye(x, y) || !shaped(x, y)) continue;
        if (style.moduleShape === 'dot') {
          const radius = (modulePt * Math.sqrt(0.79)) / 2;
          page.drawCircle({
            x: origin + (x + 0.5) * modulePt,
            y: yFor(y) + modulePt / 2,
            size: radius,
            color: fg,
          });
        } else {
          page.drawRectangle({
            x: origin + x * modulePt,
            y: yFor(y),
            width: modulePt,
            height: modulePt,
            color: fg,
            // pdf-lib has no rounded rectangle primitive. A square here is a
            // hair heavier than the SVG's rounded corner, which can only help
            // a printed code, never hurt it. Noted rather than hidden.
          });
        }
      }
    }
  }

  // Finder patterns: 7x7 ring plus a 3x3 centre, drawn as filled rectangles so
  // the ring stays exactly one module thick.
  for (const o of finderOrigins(size)) {
    const x0 = origin + o.x * modulePt;
    const yTop = yFor(o.y + 6);
    page.drawRectangle({ x: x0, y: yTop, width: 7 * modulePt, height: 7 * modulePt, color: eyeColor });
    if (bgColor) {
      page.drawRectangle({
        x: x0 + modulePt,
        y: yTop + modulePt,
        width: 5 * modulePt,
        height: 5 * modulePt,
        color: bgColor,
      });
    }
    page.drawRectangle({
      x: x0 + 2 * modulePt,
      y: yTop + 2 * modulePt,
      width: 3 * modulePt,
      height: 3 * modulePt,
      color: eyeColor,
    });
  }

  if (style.logo) {
    const boxW = style.logo.sizeRatio * size;
    const plate = (boxW + style.logo.padding * 2) * modulePt;
    const centre = origin + codePt / 2;
    const plateColor = toRgb(style.logo.plate, [1, 1, 1]);
    if (style.logo.shape === 'circle') {
      page.drawCircle({ x: centre, y: centre, size: plate / 2, color: plateColor });
    } else {
      page.drawRectangle({
        x: centre - plate / 2,
        y: centre - plate / 2,
        width: plate,
        height: plate,
        color: plateColor,
      });
    }
    const embedded = await embedLogo(doc, style.logo.href);
    if (embedded) {
      const w = boxW * modulePt;
      const scale = Math.min(w / embedded.width, w / embedded.height);
      const dw = embedded.width * scale;
      const dh = embedded.height * scale;
      page.drawImage(embedded, { x: centre - dw / 2, y: centre - dh / 2, width: dw, height: dh });
    }
  }

  if (cropMarks) {
    const black = rgb(0, 0, 0);
    const len = 6;
    const trim = markPt + bleedPt;
    const far = pagePt - trim;
    const lines = [
      // Each corner gets one horizontal and one vertical mark, outside the trim.
      [{ x: 0, y: trim }, { x: len, y: trim }],
      [{ x: trim, y: 0 }, { x: trim, y: len }],
      [{ x: pagePt - len, y: trim }, { x: pagePt, y: trim }],
      [{ x: far, y: 0 }, { x: far, y: len }],
      [{ x: 0, y: far }, { x: len, y: far }],
      [{ x: trim, y: pagePt - len }, { x: trim, y: pagePt }],
      [{ x: pagePt - len, y: far }, { x: pagePt, y: far }],
      [{ x: far, y: pagePt - len }, { x: far, y: pagePt }],
    ];
    for (const [start, end] of lines) {
      page.drawLine({ start, end, thickness: 0.25, color: black });
    }
  }

  if (options.caption) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(`${widthMm}mm, quiet zone included, do not crop`, {
      x: origin,
      y: markPt / 2,
      size: 5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  return doc.save();
}

/**
 * Embed a data-URL logo. PDF supports PNG and JPEG; an SVG logo cannot be
 * embedded by pdf-lib, and silently dropping it would be worse than saying so.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {string} href
 */
async function embedLogo(doc, href) {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(href ?? '');
  if (!match) return null;
  const [, mime, b64] = match;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    if (mime === 'image/png') return await doc.embedPng(bytes);
    if (mime === 'image/jpeg' || mime === 'image/jpg') return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

/** Logo formats a PDF can carry. */
export const PDF_LOGO_FORMATS = ['image/png', 'image/jpeg'];
