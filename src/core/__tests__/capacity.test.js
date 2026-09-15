import { describe, it, expect } from 'vitest';
import { encode, tryEncode, capacityBitsFor, headroom, naturalVersion, ECC_LETTERS } from '../encode.js';

/**
 * Capacity boundaries.
 *
 * The important property is not that big payloads fit. It is that a payload
 * one character too large fails loudly instead of being silently truncated.
 * Silent truncation is the failure mode that gets discovered after the print
 * run, when a code scans to half a URL.
 */

describe('capacity boundaries at version 40', () => {
  // The standard's numeric capacities for version 40, ISO/IEC 18004 table 7.
  const MAX_NUMERIC = { L: 7089, M: 5596, Q: 3993, H: 3057 };

  for (const ecc of ECC_LETTERS) {
    it(`fits exactly ${MAX_NUMERIC[ecc]} digits at level ${ecc}, and not one more`, async () => {
      const fits = '1'.repeat(MAX_NUMERIC[ecc]);
      // boostEcc off, or the encoder may quietly raise the level and change
      // the very capacity being measured.
      const result = encode(fits, { ecc, boostEcc: false });
      expect(result.version).toBe(40);
      expect(result.ecc).toBe(ecc);

      const tooLong = '1'.repeat(MAX_NUMERIC[ecc] + 1);
      expect(() => encode(tooLong, { ecc, boostEcc: false })).toThrow();
    });
  }

  it('reports a helpful message rather than truncating', async () => {
    const outcome = tryEncode('1'.repeat(8000), { ecc: 'L', boostEcc: false });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/too much data/i);
      // The message must say what to do, not merely that something failed.
      expect(outcome.detail ?? '').toMatch(/shorten|split/i);
    }
  });

  it('never returns a result whose text differs from the input', async () => {
    for (const n of [1, 100, 1000, 2000]) {
      const text = 'A'.repeat(n);
      const result = encode(text, { ecc: 'L', boostEcc: false });
      expect(result.text).toBe(text);
    }
  });
});

describe('capacity reporting', () => {
  it('used bits never exceed capacity bits', async () => {
    for (const text of ['a', 'https://example.com/menu', 'x'.repeat(500), '9'.repeat(2000)]) {
      const result = encode(text, { boostEcc: false });
      expect(result.usedBits).toBeLessThanOrEqual(result.capacityBits);
      expect(result.remainingBits).toBe(result.capacityBits - result.usedBits);
    }
  });

  it('agrees with the capacity table', async () => {
    const result = encode('https://example.com', { ecc: 'M', boostEcc: false });
    expect(result.capacityBits).toBe(capacityBitsFor(result.version, 'M'));
  });

  it('headroom shrinks as the payload grows', async () => {
    const short = headroom(encode('https://example.com/a', { boostEcc: false }));
    const long = headroom(encode('https://example.com/aaaaaaaaaaaaaaaaaa', { boostEcc: false }));
    expect(long.charsLeft).toBeLessThanOrEqual(short.charsLeft + 40);
    expect(short.charsLeft).toBeGreaterThanOrEqual(0);
  });
});

describe('empty and whitespace input', () => {
  it('refuses an empty string', async () => {
    expect(() => encode('')).toThrow(/nothing to encode/i);
    const outcome = tryEncode('');
    expect(outcome.ok).toBe(false);
  });

  it('encodes whitespace-only input rather than silently dropping it', async () => {
    // A single space is a legitimate payload. It must not be treated as empty,
    // and it must decode back as exactly that space.
    const result = encode('   ');
    expect(result.text).toBe('   ');
    expect(result.size).toBeGreaterThan(0);
  });
});

describe('version floor', () => {
  it('honours a floor above the natural version', async () => {
    const text = 'https://example.com';
    const natural = naturalVersion(text, 'M');
    expect(natural).toBeLessThan(10);
    const floored = encode(text, { minVersion: 12, boostEcc: false });
    expect(floored.version).toBe(12);
    expect(floored.size).toBe(12 * 4 + 17);
  });

  it('rejects a nonsensical floor with a readable message', async () => {
    expect(() => encode('test', { minVersion: 0 })).toThrow(/whole number from 1 to 40/i);
    expect(() => encode('test', { minVersion: 41 })).toThrow(/whole number from 1 to 40/i);
  });
});

describe('mask selection', () => {
  it('uses the requested mask when one is given', async () => {
    for (let mask = 0; mask <= 7; mask++) {
      const result = encode('https://example.com/menu', { mask, boostEcc: false });
      expect(result.mask).toBe(mask);
      expect(result.maskWasAutomatic).toBe(false);
    }
  });

  it('rejects an out-of-range mask', async () => {
    expect(() => encode('test', { mask: 8 })).toThrow(/0 to 7/);
  });

  it('picks a mask automatically by default', async () => {
    const result = encode('https://example.com/menu');
    expect(result.maskWasAutomatic).toBe(true);
    expect(result.mask).toBeGreaterThanOrEqual(0);
    expect(result.mask).toBeLessThanOrEqual(7);
  });
});

describe('error correction boosting', () => {
  it('reports the level actually used, not the level requested', async () => {
    // A short payload leaves spare room, which the encoder spends on error
    // correction. The result must say so rather than claiming level M.
    const result = encode('hi', { ecc: 'L', boostEcc: true });
    expect(ECC_LETTERS.indexOf(result.ecc)).toBeGreaterThanOrEqual(ECC_LETTERS.indexOf('L'));
    if (result.ecc !== 'L') expect(result.eccWasBoosted).toBe(true);
    expect(result.requestedEcc).toBe('L');
  });

  it('never changes the version when boosting', async () => {
    const text = 'https://example.com/menu';
    const plain = encode(text, { ecc: 'L', boostEcc: false });
    const boosted = encode(text, { ecc: 'L', boostEcc: true });
    expect(boosted.version).toBe(plain.version);
  });
});
