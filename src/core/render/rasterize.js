/**
 * Rasterising the styled code, in plain JavaScript.
 *
 * This exists so the self-verification loop can decode exactly what it draws,
 * with no canvas, no DOM and no platform differences. Running the same code in
 * Node means the guarantees in the test suite are the same guarantees the
 * browser gives a user.
 *
 * It renders the styled output, not the bare matrix. Verifying the bare matrix
 * would be pointless: the whole risk of styling is that dots, gradients and a
 * centre logo break a code the matrix says is fine.
 */

import { classifyModules, isStructural, finderOrigins } from '../patterns.js';
import { normaliseStyle, parseHex } from '../style.js';

/** Subpixel samples per axis. Gives the soft edges a real printer and camera produce. */
const SUPERSAMPLE = 3;

/**
 * @typedef {object} RasterResult
 * @property {Uint8ClampedArray} data RGBA, row-major.
 * @property {number} width
 * @property {number} height
 * @property {number} modulePx Whole pixels per module.
 */

/**
 * @param {string} c
 * @param {[number, number, number]} fallback
 * @returns {[number, number, number]}
 */
function rgbOf(c, fallback) {
  const p = parseHex(c);
  return p ? [p.r, p.g, p.b] : fallback;
}

/**
 * Render a styled code to an RGBA buffer.
 *
 * @param {boolean[][]} matrix
 * @param {number} version
 * @param {object} [options]
 * @param {import('../style.js').StyleSpec} [options.style]
 * @param {number} [options.modulePx] Whole pixels per module. Always an
 *   integer, so no module ever lands on a half pixel and blurs.
 * @param {boolean} [options.drawLogoPlate] Default true.
 * @returns {RasterResult}
 */
export function rasterize(matrix, version, options = {}) {
  const { style } = normaliseStyle(options.style ?? {});
  const modulePx = Math.max(1, Math.round(options.modulePx ?? 6));
  const drawLogoPlate = options.drawLogoPlate !== false;

  const size = matrix.length;
  const qz = style.quietZone;
  const total = size + qz * 2;
  const width = total * modulePx;
  const height = width;

  const roles = classifyModules(version);

  /*
    Fast path for the default style.

    When every module is an axis-aligned square and the colours are flat, each
    module lands exactly on integer pixel boundaries, so there is nothing to
    anti-alias and the 3x3 subpixel sampling below is 9 wasted tests per pixel.
    Filling rectangles directly is roughly an order of magnitude cheaper, and it
    is the path almost every code takes, because square black-on-white is both
    the default and the right answer for most printing.

    The slow path still handles dots, rounded corners, circular eyes and
    gradients, where the soft edges genuinely matter to whether it decodes.
  */
  const isPlainSquare =
    style.moduleShape === 'square' &&
    style.eyeFrame === 'square' &&
    style.eyeBall === 'square' &&
    !style.gradient &&
    !style.eyeColor;

  if (isPlainSquare) {
    return rasterizePlain(matrix, style, modulePx, drawLogoPlate);
  }

  const bgTransparentWhite = style.background === 'transparent';
  const bg = rgbOf(bgTransparentWhite ? '#FFFFFF' : style.background, [255, 255, 255]);
  const fgSolid = rgbOf(style.foreground, [0, 0, 0]);
  const eyeRgb = style.eyeColor ? rgbOf(style.eyeColor, fgSolid) : null;
  const gradFrom = style.gradient ? rgbOf(style.gradient.from, fgSolid) : null;
  const gradTo = style.gradient ? rgbOf(style.gradient.to, fgSolid) : null;
  const gradAngle = ((style.gradient?.angle ?? 45) * Math.PI) / 180;
  const gx = Math.cos(gradAngle);
  const gy = Math.sin(gradAngle);

  const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && matrix[y][x];
  const isEye = (x, y) => roles[y][x] === 'finder';
  const keepSquare = (x, y) => style.moduleShape === 'square' || isStructural(roles[y][x]);

  // Coverage mask at subpixel resolution, accumulated per output pixel.
  const cov = new Float32Array(width * height);
  const sub = 1 / SUPERSAMPLE;
  const subArea = 1 / (SUPERSAMPLE * SUPERSAMPLE);

  /** Mark coverage for a shape test over a bounding box in module coordinates. */
  const paint = (mx0, my0, mx1, my1, inside) => {
    const px0 = Math.max(0, Math.floor(mx0 * modulePx));
    const py0 = Math.max(0, Math.floor(my0 * modulePx));
    const px1 = Math.min(width, Math.ceil(mx1 * modulePx));
    const py1 = Math.min(height, Math.ceil(my1 * modulePx));
    for (let py = py0; py < py1; py++) {
      for (let px = px0; px < px1; px++) {
        let hits = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          const my = (py + (sy + 0.5) * sub) / modulePx;
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            const mx = (px + (sx + 0.5) * sub) / modulePx;
            if (inside(mx, my)) hits++;
          }
        }
        if (hits) {
          const i = py * width + px;
          cov[i] = Math.min(1, cov[i] + hits * subArea);
        }
      }
    }
  };

  const dotRadius = 0.5 * Math.sqrt(0.79);
  const roundedR = 0.34;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark(x, y) || isEye(x, y)) continue;
      const ox = x + qz;
      const oy = y + qz;

      if (keepSquare(x, y)) {
        paint(ox, oy, ox + 1, oy + 1, () => true);
      } else if (style.moduleShape === 'dot') {
        const cx = ox + 0.5;
        const cy = oy + 0.5;
        paint(ox, oy, ox + 1, oy + 1, (mx, my) => (mx - cx) ** 2 + (my - cy) ** 2 <= dotRadius ** 2);
      } else {
        // Rounded: square with the corners cut, but only on edges where there
        // is no dark neighbour, matching the capsule merging the SVG does.
        const left = dark(x - 1, y) && !isEye(x - 1, y);
        const right = dark(x + 1, y) && !isEye(x + 1, y);
        paint(ox, oy, ox + 1, oy + 1, (mx, my) => {
          const lx = mx - ox;
          const ly = my - oy;
          const nx = !left && lx < roundedR ? roundedR - lx : !right && lx > 1 - roundedR ? lx - (1 - roundedR) : 0;
          const ny = ly < roundedR ? roundedR - ly : ly > 1 - roundedR ? ly - (1 - roundedR) : 0;
          return nx === 0 || ny === 0 || nx * nx + ny * ny <= roundedR * roundedR;
        });
      }
    }
  }

  // Finder patterns.
  const eyeCov = new Float32Array(width * height);
  const paintEye = (mx0, my0, mx1, my1, inside) => {
    const px0 = Math.max(0, Math.floor(mx0 * modulePx));
    const py0 = Math.max(0, Math.floor(my0 * modulePx));
    const px1 = Math.min(width, Math.ceil(mx1 * modulePx));
    const py1 = Math.min(height, Math.ceil(my1 * modulePx));
    for (let py = py0; py < py1; py++) {
      for (let px = px0; px < px1; px++) {
        let hits = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          const my = (py + (sy + 0.5) * sub) / modulePx;
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            const mx = (px + (sx + 0.5) * sub) / modulePx;
            if (inside(mx, my)) hits++;
          }
        }
        if (hits) {
          const i = py * width + px;
          eyeCov[i] = Math.min(1, eyeCov[i] + hits * subArea);
        }
      }
    }
  };

  for (const o of finderOrigins(size)) {
    const ox = o.x + qz;
    const oy = o.y + qz;
    const cx = ox + 3.5;
    const cy = oy + 3.5;

    const inRing = (mx, my) => {
      if (style.eyeFrame === 'circle') {
        const r = Math.hypot(mx - cx, my - cy);
        return r <= 3.5 && r >= 2.5;
      }
      if (style.eyeFrame === 'rounded') {
        return inRoundedRect(mx, my, ox, oy, 7, 7, 2) && !inRoundedRect(mx, my, ox + 1, oy + 1, 5, 5, 1.4);
      }
      const outer = mx >= ox && mx < ox + 7 && my >= oy && my < oy + 7;
      const inner = mx >= ox + 1 && mx < ox + 6 && my >= oy + 1 && my < oy + 6;
      return outer && !inner;
    };
    const inBall = (mx, my) => {
      if (style.eyeBall === 'circle') return Math.hypot(mx - cx, my - cy) <= 1.5;
      if (style.eyeBall === 'rounded') return inRoundedRect(mx, my, ox + 2, oy + 2, 3, 3, 0.9);
      return mx >= ox + 2 && mx < ox + 5 && my >= oy + 2 && my < oy + 5;
    };

    paintEye(ox, oy, ox + 7, oy + 7, (mx, my) => inRing(mx, my) || inBall(mx, my));
  }

  // Compose into RGBA.
  const data = new Uint8ClampedArray(width * height * 4);
  const diag = Math.max(1e-6, Math.abs(gx) + Math.abs(gy));
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const o = i * 4;
      const a = cov[i];
      const e = eyeCov[i];

      let fr = fgSolid[0];
      let fg_ = fgSolid[1];
      let fb = fgSolid[2];
      if (gradFrom && gradTo) {
        const u = px / width - 0.5;
        const v = py / height - 0.5;
        const t = Math.min(1, Math.max(0, (u * gx + v * gy) / diag + 0.5));
        fr = gradFrom[0] + (gradTo[0] - gradFrom[0]) * t;
        fg_ = gradFrom[1] + (gradTo[1] - gradFrom[1]) * t;
        fb = gradFrom[2] + (gradTo[2] - gradFrom[2]) * t;
      }

      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      if (a > 0) {
        r = r * (1 - a) + fr * a;
        g = g * (1 - a) + fg_ * a;
        b = b * (1 - a) + fb * a;
      }
      if (e > 0) {
        const er = eyeRgb ? eyeRgb[0] : fr;
        const eg = eyeRgb ? eyeRgb[1] : fg_;
        const eb = eyeRgb ? eyeRgb[2] : fb;
        r = r * (1 - e) + er * e;
        g = g * (1 - e) + eg * e;
        b = b * (1 - e) + eb * e;
      }

      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }

  // The logo plate, drawn last, exactly as the SVG draws it. The logo artwork
  // itself is not rasterised: the plate is what destroys modules, and treating
  // the whole plate as lost is the honest worst case.
  if (drawLogoPlate && style.logo) {
    paintLogoPlate(data, width, height, style, size, qz, modulePx);
  }

  return { data, width, height, modulePx };
}

function inRoundedRect(mx, my, x, y, w, h, r) {
  if (mx < x || my < y || mx >= x + w || my >= y + h) return false;
  const dx = mx < x + r ? x + r - mx : mx > x + w - r ? mx - (x + w - r) : 0;
  const dy = my < y + r ? y + r - my : my > y + h - r ? my - (y + h - r) : 0;
  return dx === 0 || dy === 0 || dx * dx + dy * dy <= r * r;
}

/**
 * The fast path: flat colours, square modules, integer pixel boundaries.
 *
 * Produces byte-identical output to the general path for this style, which the
 * test in quietzone.test.js asserts directly.
 *
 * @param {boolean[][]} matrix
 * @param {import('../style.js').StyleSpec} style
 * @param {number} modulePx
 * @param {boolean} drawLogoPlate
 * @returns {RasterResult}
 */
function rasterizePlain(matrix, style, modulePx, drawLogoPlate) {
  const size = matrix.length;
  const qz = style.quietZone;
  const total = size + qz * 2;
  const width = total * modulePx;
  const height = width;

  const bg = rgbOf(style.background === 'transparent' ? '#FFFFFF' : style.background, [255, 255, 255]);
  const fg = rgbOf(style.foreground, [0, 0, 0]);

  const data = new Uint8ClampedArray(width * height * 4);

  // Background: build one row, then copy it down. Copying a typed array is far
  // cheaper than writing every pixel in JavaScript.
  const row = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) {
    const o = x * 4;
    row[o] = bg[0];
    row[o + 1] = bg[1];
    row[o + 2] = bg[2];
    row[o + 3] = 255;
  }
  for (let y = 0; y < height; y++) data.set(row, y * width * 4);

  // Dark modules, filled as whole rectangles.
  for (let my = 0; my < size; my++) {
    const rowOfModules = matrix[my];
    const y0 = (my + qz) * modulePx;
    for (let mx = 0; mx < size; mx++) {
      if (!rowOfModules[mx]) continue;
      const x0 = (mx + qz) * modulePx;
      for (let y = y0; y < y0 + modulePx; y++) {
        let o = (y * width + x0) * 4;
        for (let x = 0; x < modulePx; x++) {
          data[o] = fg[0];
          data[o + 1] = fg[1];
          data[o + 2] = fg[2];
          data[o + 3] = 255;
          o += 4;
        }
      }
    }
  }

  if (drawLogoPlate && style.logo) {
    paintLogoPlate(data, width, height, style, size, qz, modulePx);
  }

  return { data, width, height, modulePx };
}

/**
 * The plate behind a centre logo, shared by both raster paths.
 * @param {Uint8ClampedArray} data
 * @param {number} width @param {number} height
 * @param {import('../style.js').StyleSpec} style
 * @param {number} size @param {number} qz @param {number} modulePx
 */
function paintLogoPlate(data, width, height, style, size, qz, modulePx) {
  const boxW = style.logo.sizeRatio * size;
  const plate = boxW + style.logo.padding * 2;
  const c = (qz + size / 2) * modulePx;
  const half = (plate / 2) * modulePx;
  const plateRgb = rgbOf(style.logo.plate, [255, 255, 255]);
  const y0 = Math.max(0, Math.floor(c - half));
  const y1 = Math.min(height, Math.ceil(c + half));
  const x0 = Math.max(0, Math.floor(c - half));
  const x1 = Math.min(width, Math.ceil(c + half));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (style.logo.shape === 'circle' && Math.hypot(px + 0.5 - c, py + 0.5 - c) > half) continue;
      const o = (py * width + px) * 4;
      data[o] = plateRgb[0];
      data[o + 1] = plateRgb[1];
      data[o + 2] = plateRgb[2];
      data[o + 3] = 255;
    }
  }
}

/**
 * Sample the colour at the centre of each module. Used by the test that proves
 * the rasteriser and the matrix agree.
 * @param {RasterResult} raster
 * @param {number} size
 * @param {number} quietZone
 * @returns {boolean[][]} true where the module centre is dark
 */
export function sampleModuleCentres(raster, size, quietZone) {
  const { data, width, modulePx } = raster;
  const out = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const px = Math.floor((x + quietZone + 0.5) * modulePx);
      const py = Math.floor((y + quietZone + 0.5) * modulePx);
      const o = (py * width + px) * 4;
      const lum = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
      row.push(lum < 128);
    }
    out.push(row);
  }
  return out;
}
