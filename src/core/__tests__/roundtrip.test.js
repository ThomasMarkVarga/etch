import { describe, it, expect } from 'vitest';
import { encode } from '../encode.js';
import { matrixToSvg, mergeRectangles, rectsToMatrix } from '../render/matrixToSvg.js';
import { verify } from '../verify.js';
import { rasterize, sampleModuleCentres } from '../render/rasterize.js';
import { buildPayload, PAYLOAD_TYPES } from '../../payloads/index.js';

/**
 * The round trip: build a payload, encode it, render it, decode the render,
 * and assert the decoded string is identical to what went in.
 *
 * This is the test that matters most. Everything else in this app is an
 * opinion; this one is a fact about whether the output works.
 */

/** Build a realistic example for every payload type in the registry. */
function exampleFor(type) {
  return buildPayload(type.id, type.example);
}

describe('round trip: every payload type', () => {
  for (const type of PAYLOAD_TYPES) {
    it(`${type.id} survives encode, render and decode unchanged`, () => {
      const text = exampleFor(type);
      expect(text.length, `${type.id} produced an empty payload`).toBeGreaterThan(0);

      const result = encode(text);
      const check = verify(result.matrix, result.version, text);

      for (const condition of check.conditions) {
        expect(condition.got, `${type.id} under "${condition.label}"`).toBe(text);
      }
      expect(check.pass).toBe(true);
    });
  }
});

describe('round trip: the three cases from the brief', () => {
  const BACKSLASH = String.fromCharCode(92);

  const cases = [
    ['a plain URL', 'https://vibe-coding.fans/etch'],
    // Built by hand here rather than via the builder, so this test still
    // catches a regression if the escaping in wifi.js changes.
    ['a Wi-Fi password containing ; and a backslash', `WIFI:T:WPA;S:Cafeaua Bună;P:Latte${BACKSLASH};2024${BACKSLASH}${BACKSLASH}Vanilla;;`],
    ['Romanian diacritics', 'Mâine plecăm în Târgu Jiu și ștergem țărmul'],
  ];

  for (const [label, text] of cases) {
    it(`decodes ${label} byte for byte`, () => {
      const result = encode(text);
      const check = verify(result.matrix, result.version, text);
      expect(check.failedIds).toEqual([]);
      expect(check.conditions.every((c) => c.got === text)).toBe(true);
    });
  }
});

describe('the degraded conditions are calibrated, not decorative', () => {
  it('a plain code passes every condition', () => {
    const result = encode('https://example.com/menu');
    const check = verify(result.matrix, result.version, 'https://example.com/menu');
    expect(check.pass).toBe(true);
  });

  it('a code with no contrast fails, rather than passing everything', () => {
    const text = 'https://example.com/menu';
    const result = encode(text);
    // Light grey on white: technically rendered, practically unreadable.
    const check = verify(result.matrix, result.version, text, {
      style: { foreground: '#DDDDDD', background: '#FFFFFF' },
    });
    expect(check.pass).toBe(false);
  });

  it('a very dense code stops passing every condition', () => {
    // A dense code has small modules, and small modules are what actually
    // defeats a camera. The specific condition that breaks first is not worth
    // asserting: jsQR turns out to handle three pixels per module better than
    // expected, so the meaningful claim is that the suite stops returning a
    // clean pass, not which row goes red first.
    const text = 'x'.repeat(1200);
    const result = encode(text);
    expect(result.version).toBeGreaterThan(20);
    const check = verify(result.matrix, result.version, text);
    expect(check.pass).toBe(false);
  });
});

describe('SVG path merging', () => {
  it('produces exactly the same matrix as one rectangle per module', () => {
    for (const text of ['https://example.com', 'Mâine', '12345678901234567890', 'x'.repeat(300)]) {
      const result = encode(text);
      const rects = mergeRectangles((x, y) => result.matrix[y][x], result.size);
      const rebuilt = rectsToMatrix(rects, result.size);
      expect(rebuilt).toEqual(result.matrix);
    }
  });

  it('merges far fewer paths than there are dark modules', () => {
    const result = encode('https://example.com/menu');
    const svg = matrixToSvg(result.matrix, result.version);
    expect(svg.rectCount).toBeLessThan(svg.naiveRectCount * 0.65);
  });

  it('emits a title and a description naming the payload type', () => {
    const result = encode('https://example.com/menu');
    const svg = matrixToSvg(result.matrix, result.version, {
      title: 'Website QR code',
      desc: 'Static QR code holding a website payload.',
    });
    expect(svg.svg).toContain('<title id="etch-title">Website QR code</title>');
    expect(svg.svg).toContain('<desc id="etch-desc">');
    expect(svg.svg).toContain('role="img"');
    expect(svg.svg).toContain('aria-labelledby="etch-title etch-desc"');
  });

  it('escapes markup in the title rather than injecting it', () => {
    const result = encode('test');
    const svg = matrixToSvg(result.matrix, result.version, { title: '<script>alert(1)</script>' });
    expect(svg.svg).not.toContain('<script>');
    expect(svg.svg).toContain('&lt;script&gt;');
  });
});

describe('the rasteriser agrees with the matrix', () => {
  it('samples every module centre back to the value in the matrix', () => {
    const result = encode('https://example.com/menu');
    const raster = rasterize(result.matrix, result.version, { modulePx: 9 });
    const sampled = sampleModuleCentres(raster, result.size, 4);
    expect(sampled).toEqual(result.matrix);
  });

  it('uses whole pixels per module, so nothing lands on a half pixel', () => {
    const result = encode('https://example.com');
    for (const modulePx of [3, 4, 7, 12]) {
      const raster = rasterize(result.matrix, result.version, { modulePx });
      expect(raster.width % (result.size + 8)).toBe(0);
      expect(raster.width / (result.size + 8)).toBe(modulePx);
    }
  });
});
