import { describe, it, expect } from 'vitest';
import { encode } from '../encode.js';
import { verify, findStyleCulprit } from '../verify.js';
import {
  contrastRatio,
  checkContrast,
  checkLogo,
  logoCoverage,
  eccForLogo,
  LOGO_COVERAGE_CEILING,
  normaliseStyle,
  CONTRAST,
  EYE_PAIRS,
} from '../style.js';
import { classifyModules, isStructural } from '../patterns.js';

/**
 * Styling, and the guards that stop it ruining a code.
 *
 * The important claims here are the ones about failure: a logo above the
 * ceiling must actually fail, and low contrast must actually be refused.
 * A guard that never triggers is decoration.
 */

const TEXT = 'https://example.com/menu';

describe('contrast', () => {
  it('computes the WCAG ratio correctly at the known extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The canonical mid-grey value, useful as a regression anchor.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('accepts short hex and rejects nonsense', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('not-a-colour', '#fff')).toBeNull();
  });

  it('passes plain black on white', () => {
    const check = checkContrast(normaliseStyle({}).style);
    expect(check.level).toBe('good');
    expect(check.inverted).toBe(false);
    expect(check.message).toBeNull();
  });

  it('refuses a combination below the safe threshold', () => {
    const { style } = normaliseStyle({ foreground: '#BBBBBB', background: '#FFFFFF' });
    const check = checkContrast(style);
    expect(check.ratio).toBeLessThan(CONTRAST.RISKY);
    expect(check.level).toBe('fail');
    expect(check.message).toMatch(/too close together/i);
  });

  it('flags inversion explicitly rather than allowing it silently', () => {
    const { style } = normaliseStyle({ foreground: '#FFFFFF', background: '#000000' });
    const check = checkContrast(style);
    expect(check.inverted).toBe(true);
    // 21:1 contrast, but still downgraded, because the warning is about
    // scanner behaviour rather than about contrast.
    expect(check.level).toBe('risky');
    expect(check.message).toMatch(/light on dark/i);
  });

  it('judges a gradient by its worst stop, not its average', () => {
    const { style } = normaliseStyle({
      background: '#FFFFFF',
      gradient: { from: '#000000', to: '#CCCCCC', angle: 45 },
    });
    const check = checkContrast(style);
    expect(check.level).toBe('fail');
  });
});

describe('logo coverage', () => {
  const result = encode(TEXT, { ecc: 'H', boostEcc: false });

  it('counts a partly covered module as covered', () => {
    // A module the logo clips is unreadable, so rounding must go upwards.
    const cover = logoCoverage(result.size, { sizeRatio: 0.2, padding: 1, href: '', shape: 'square', plate: '#fff' });
    const naive = (0.2 * result.size) ** 2 / result.size ** 2;
    expect(cover.coverage).toBeGreaterThan(naive);
  });

  it('allows a logo under the ceiling and refuses one over it', () => {
    const under = checkLogo(result.size, { sizeRatio: 0.1, padding: 0, href: '', shape: 'square', plate: '#fff' }, 'H');
    expect(under.ok).toBe(true);

    const over = checkLogo(result.size, { sizeRatio: 0.38, padding: 2, href: '', shape: 'square', plate: '#fff' }, 'H');
    expect(over.ok).toBe(false);
    expect(over.level).toBe('fail');
    expect(over.message).toMatch(/covers/i);
  });

  it('keeps every ceiling below the nominal recovery budget', () => {
    // The whole point: the budget also has to absorb print defects and dirt,
    // so the app must never spend all of it on decoration.
    const nominal = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
    for (const level of ['L', 'M', 'Q', 'H']) {
      expect(LOGO_COVERAGE_CEILING[level]).toBeLessThan(nominal[level]);
      expect(LOGO_COVERAGE_CEILING[level]).toBeGreaterThan(nominal[level] * 0.4);
    }
  });

  it('suggests the level a given logo actually needs', () => {
    const small = { sizeRatio: 0.08, padding: 0, href: '', shape: 'square', plate: '#fff' };
    const big = { sizeRatio: 0.3, padding: 1, href: '', shape: 'square', plate: '#fff' };
    expect(eccForLogo(result.size, small)).toBe('L');
    expect(['Q', 'H', null]).toContain(eccForLogo(result.size, big));
  });
});

describe('a logo at the ceiling still decodes; above it, it does not', () => {
  const text = TEXT;
  const result = encode(text, { ecc: 'H', boostEcc: false });
  const logo = (sizeRatio) => ({ href: '', sizeRatio, padding: 1, shape: 'square', plate: '#FFFFFF' });

  it('decodes at the coverage ceiling', () => {
    // Find the largest logo the ceiling permits, then prove that one works.
    let permitted = 0.05;
    for (let r = 0.05; r <= 0.4; r += 0.01) {
      if (checkLogo(result.size, logo(r), 'H').ok) permitted = r;
    }
    const check = verify(result.matrix, result.version, text, { style: { ...normaliseStyle({}).style, logo: logo(permitted) } });
    expect(check.pass, `a logo at the permitted ceiling (${permitted.toFixed(2)}) should still decode`).toBe(true);
  });

  it('fails the check well before the code becomes unreadable', () => {
    // The guard is deliberately conservative, so there is a band where the
    // check refuses a logo that would in fact still scan in a clean render.
    // That is the intended safety margin, not a bug.
    const reckless = logo(0.45);
    expect(checkLogo(result.size, reckless, 'H').ok).toBe(false);
  });

  it('a genuinely oversized logo breaks the decode', () => {
    const check = verify(result.matrix, result.version, text, {
      style: { ...normaliseStyle({}).style, logo: logo(0.6) },
    });
    expect(check.pass).toBe(false);
  });
});

describe('module shapes keep the structural patterns intact', () => {
  it('classifies finders, timing and alignment correctly', () => {
    const roles = classifyModules(7);
    expect(roles[0][0]).toBe('finder');
    expect(roles[3][3]).toBe('finder');
    expect(roles[6][10]).toBe('timing');
    expect(roles[10][6]).toBe('timing');
    expect(isStructural('finder')).toBe(true);
    expect(isStructural('timing')).toBe(true);
    expect(isStructural('data')).toBe(false);
  });

  it('decodes with every module shape', () => {
    const result = encode(TEXT);
    for (const moduleShape of ['square', 'rounded', 'dot']) {
      const check = verify(result.matrix, result.version, TEXT, {
        style: { ...normaliseStyle({}).style, moduleShape },
      });
      expect(check.pass, `${moduleShape} should still decode`).toBe(true);
    }
  });

  it('decodes with every corner shape the interface offers', () => {
    const result = encode(TEXT);
    for (const pair of EYE_PAIRS) {
      const check = verify(result.matrix, result.version, TEXT, {
        style: { ...normaliseStyle({}).style, eyeFrame: pair.frame, eyeBall: pair.ball },
      });
      expect(check.pass, `${pair.id} corners should still decode`).toBe(true);
    }
  });

  it('confirms the mismatched combinations that are deliberately not offered', () => {
    // This is a regression guard on the reason EYE_PAIRS exists. A square ring
    // around a circular centre, or the reverse, breaks the 1:1:3:1:1 proportion
    // a scanner looks for on every scan line but the middle one. If this ever
    // starts passing, the rendering has changed and the restriction should be
    // re-measured rather than silently kept.
    const result = encode(TEXT);
    const mismatched = verify(result.matrix, result.version, TEXT, {
      style: { ...normaliseStyle({}).style, eyeFrame: 'circle', eyeBall: 'square' },
    });
    expect(mismatched.pass).toBe(false);
  });
});

describe('finding the culprit when a style breaks the code', () => {
  it('names the offending choice rather than guessing', () => {
    const result = encode(TEXT);
    const style = { ...normaliseStyle({}).style, foreground: '#CCCCCC', background: '#FFFFFF' };
    const check = verify(result.matrix, result.version, TEXT, { style });
    expect(check.pass).toBe(false);

    const culprit = findStyleCulprit(result.matrix, result.version, TEXT, style);
    expect(culprit).not.toBeNull();
    expect(culprit?.culprit).toBe('colors');

    // And the suggested revert must actually fix it.
    const fixed = verify(result.matrix, result.version, TEXT, { style: { ...style, ...culprit.revert } });
    expect(fixed.pass).toBe(true);
  });

  it('returns null when nothing in the style is to blame', () => {
    const result = encode(TEXT);
    const style = normaliseStyle({}).style;
    expect(findStyleCulprit(result.matrix, result.version, TEXT, style)).toBeNull();
  });
});
