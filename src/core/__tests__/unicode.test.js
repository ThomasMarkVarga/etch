import { describe, it, expect } from 'vitest';
import { encode } from '../encode.js';
import { verify } from '../verify.js';

/**
 * Non-ASCII payloads.
 *
 * A great many generators mangle this, usually by encoding the string as
 * Latin-1 and losing every accent, or by counting UTF-16 units and truncating
 * an emoji in half. Romanian is the house test case, because ș and ț are the
 * specific characters that get quietly replaced with s and t.
 */

const CASES = [
  ['Romanian, all five diacritics', 'ăâîșț ĂÂÎȘȚ'],
  ['Romanian sentence', 'Mâine plecăm în Târgu Jiu și ștergem țărmul'],
  ['Romanian with the comma-below forms', 'Constanța București Brașov Timișoara'],
  ['German', 'Größenwahn Straße Müller'],
  ['French', 'Crème brûlée à côté'],
  ['Cyrillic', 'Привет мир, как дела'],
  ['Greek', 'Καλημέρα κόσμε'],
  ['Emoji, astral plane', 'Coffee ☕ and cake 🍰 at 10'],
  ['Emoji with a skin tone modifier', '👋🏽 Salut'],
  ['A family emoji joined with zero-width joiners', '👨‍👩‍👧‍👦'],
  ['Mixed scripts', 'Cafeaua Bună ☕ Привет'],
  ['Combining characters', 'é vs é'],
];

describe('non-ASCII payloads survive the round trip exactly', () => {
  for (const [label, text] of CASES) {
    it(label, () => {
      const result = encode(text);
      expect(result.text).toBe(text);
      expect(result.hasNonAscii).toBe(true);

      const check = verify(result.matrix, result.version, text);
      expect(check.pass, `failed under: ${check.failedIds.join(', ')}`).toBe(true);
      for (const c of check.conditions) expect(c.got).toBe(text);
    });
  }
});

describe('the specific Romanian failure mode', () => {
  it('keeps comma-below ș and ț distinct from cedilla ş and ţ', () => {
    // U+0219/U+021B are the correct Romanian letters. U+015F/U+0163 are the
    // Turkish cedilla forms that older software substitutes. A code that
    // decodes to the wrong one is wrong, even though it looks almost identical.
    const correct = 'șț';
    const cedilla = 'şţ';
    expect(correct).not.toBe(cedilla);

    const result = encode(correct);
    const check = verify(result.matrix, result.version, correct);
    expect(check.conditions.every((c) => c.got === correct)).toBe(true);
    expect(check.conditions.every((c) => c.got !== cedilla)).toBe(true);
  });

  it('counts bytes rather than characters when reporting length', () => {
    // 'ăâîșț' is five characters but ten UTF-8 bytes. An encoder that thinks
    // it is five bytes will overrun.
    const text = 'ăâîșț';
    expect(text.length).toBe(5);
    expect(new TextEncoder().encode(text).length).toBe(10);
    const result = encode(text);
    const check = verify(result.matrix, result.version, text);
    expect(check.pass).toBe(true);
  });
});

describe('astral characters are not split', () => {
  it('treats an emoji as one code point, not two UTF-16 units', () => {
    const text = '🍰';
    expect(text.length).toBe(2); // two UTF-16 units
    const result = encode(text);
    expect(result.text).toBe(text);
    const check = verify(result.matrix, result.version, text);
    expect(check.conditions.every((c) => c.got === text)).toBe(true);
  });
});

describe('explicit UTF-8 declaration', () => {
  const text = 'Mâine în Târgu';

  it('produces a valid code either way', () => {
    const without = encode(text, { declareUtf8: false });
    const with_ = encode(text, { declareUtf8: true });
    expect(without.declaredUtf8).toBe(false);
    expect(with_.declaredUtf8).toBe(true);
    // The declaration costs bits, so the code can only get bigger, never smaller.
    expect(with_.usedBits).toBeGreaterThan(without.usedBits);
  });

  it('round trips without the declaration, which is why that is the default', () => {
    const result = encode(text, { declareUtf8: false });
    const check = verify(result.matrix, result.version, text);
    expect(check.pass).toBe(true);
    expect(check.conditions.every((c) => c.got === text)).toBe(true);
  });
});

describe('ASCII detection', () => {
  it('does not claim non-ASCII for plain text', () => {
    expect(encode('https://example.com/menu').hasNonAscii).toBe(false);
    expect(encode('Plain ASCII 123 !@#').hasNonAscii).toBe(false);
  });
});
