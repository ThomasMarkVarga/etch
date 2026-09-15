import { describe, it, expect } from 'vitest';
import { encode, MIN_QUIET_ZONE } from '../encode.js';
import { matrixToSvg } from '../render/matrixToSvg.js';
import { rasterize } from '../render/rasterize.js';
import { normaliseStyle } from '../style.js';

/**
 * The quiet zone.
 *
 * Four modules of clear space on every side, always, in every export. Trimming
 * into it is the single most common reason a printed code fails, and it is
 * invisible until after the print run, so the app never allows less than the
 * standard requires.
 */

const TEXT = 'https://example.com/menu';

describe('the quiet zone cannot be removed', () => {
  it('clamps anything below the minimum back up to it', () => {
    for (const requested of [0, 1, 2, 3, -5]) {
      const { style, adjustments } = normaliseStyle({ quietZone: requested });
      expect(style.quietZone).toBe(MIN_QUIET_ZONE);
      if (requested < MIN_QUIET_ZONE && requested >= 0) {
        // Clamping happens, and it is reported rather than done silently.
        expect(adjustments.length).toBeGreaterThan(0);
      }
    }
  });

  it('honours a larger quiet zone when asked', () => {
    const { style } = normaliseStyle({ quietZone: 8 });
    expect(style.quietZone).toBe(8);
  });

  it('defaults to exactly the standard minimum', () => {
    expect(normaliseStyle({}).style.quietZone).toBe(4);
    expect(MIN_QUIET_ZONE).toBe(4);
  });
});

describe('SVG exports include the quiet zone', () => {
  it('sizes the viewBox to the code plus the border on both sides', () => {
    const result = encode(TEXT);
    for (const quietZone of [4, 6, 10]) {
      const svg = matrixToSvg(result.matrix, result.version, { style: { quietZone } });
      const expected = result.size + quietZone * 2;
      expect(svg.totalModules).toBe(expected);
      expect(svg.svg).toContain(`viewBox="0 0 ${expected} ${expected}"`);
    }
  });

  it('draws no dark module inside the border', () => {
    const result = encode(TEXT);
    const quietZone = 4;
    const svg = matrixToSvg(result.matrix, result.version, { style: { quietZone } });

    // Every path command starts at an absolute M x y. None may fall in the
    // border, and none may run past the far edge.
    const moves = [...svg.svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    expect(moves.length).toBeGreaterThan(0);
    const limit = quietZone + result.size;
    for (const [x, y] of moves) {
      expect(x).toBeGreaterThanOrEqual(quietZone);
      expect(y).toBeGreaterThanOrEqual(quietZone);
      expect(x).toBeLessThanOrEqual(limit);
      expect(y).toBeLessThanOrEqual(limit);
    }
  });

  it('paints a background across the border, so the border is white paper', () => {
    const result = encode(TEXT);
    const svg = matrixToSvg(result.matrix, result.version, { style: { quietZone: 4, background: '#FFFFFF' } });
    const total = result.size + 8;
    expect(svg.svg).toContain(`<rect width="${total}" height="${total}" fill="#FFFFFF"/>`);
  });
});

describe('raster exports include the quiet zone', () => {
  it('leaves the border entirely background-coloured', () => {
    const result = encode(TEXT);
    const quietZone = 4;
    const modulePx = 6;
    const raster = rasterize(result.matrix, result.version, { modulePx, style: { quietZone } });

    const border = quietZone * modulePx;
    const isBackground = (x, y) => {
      const o = (y * raster.width + x) * 4;
      return raster.data[o] === 255 && raster.data[o + 1] === 255 && raster.data[o + 2] === 255;
    };

    // Sample the four edges of the border rather than every pixel.
    for (let i = 0; i < raster.width; i += 3) {
      for (const y of [0, border - 1, raster.height - border, raster.height - 1]) {
        expect(isBackground(i, y), `pixel ${i},${y} in the border is not background`).toBe(true);
      }
      for (const x of [0, border - 1, raster.width - border, raster.width - 1]) {
        expect(isBackground(x, i), `pixel ${x},${i} in the border is not background`).toBe(true);
      }
    }
  });

  it('scales the raster to include the border at every module size', () => {
    const result = encode(TEXT);
    for (const quietZone of [4, 7]) {
      for (const modulePx of [3, 8]) {
        const raster = rasterize(result.matrix, result.version, { modulePx, style: { quietZone } });
        expect(raster.width).toBe((result.size + quietZone * 2) * modulePx);
      }
    }
  });
});
