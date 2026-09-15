import { describe, it, expect } from 'vitest';
import { encode } from '../encode.js';
import { verify, findStyleCulprit } from '../verify.js';
import {
  contrastRatio,
  checkContrast,
  checkLogo,
  logoCoverage,
  eccForLogo,
  logoCeiling,
  normaliseStyle,
  CONTRAST,
  EYE_PAIRS,
  maxLogoRatio,
  planForLogo,
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
  it('computes the WCAG ratio correctly at the known extremes', async () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The canonical mid-grey value, useful as a regression anchor.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('accepts short hex and rejects nonsense', async () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('not-a-colour', '#fff')).toBeNull();
  });

  it('passes plain black on white', async () => {
    const check = checkContrast(normaliseStyle({}).style);
    expect(check.level).toBe('good');
    expect(check.inverted).toBe(false);
    expect(check.message).toBeNull();
  });

  it('refuses a combination below the safe threshold', async () => {
    const { style } = normaliseStyle({ foreground: '#BBBBBB', background: '#FFFFFF' });
    const check = checkContrast(style);
    expect(check.ratio).toBeLessThan(CONTRAST.RISKY);
    expect(check.level).toBe('fail');
    expect(check.message).toMatch(/too close together/i);
  });

  it('flags inversion explicitly rather than allowing it silently', async () => {
    const { style } = normaliseStyle({ foreground: '#FFFFFF', background: '#000000' });
    const check = checkContrast(style);
    expect(check.inverted).toBe(true);
    // 21:1 contrast, but still downgraded, because the warning is about
    // scanner behaviour rather than about contrast.
    expect(check.level).toBe('risky');
    expect(check.message).toMatch(/light on dark/i);
  });

  it('judges a gradient by its worst stop, not its average', async () => {
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

  it('counts a partly covered module as covered', async () => {
    // A module the logo clips is unreadable, so rounding must go upwards.
    const cover = logoCoverage(result.size, { sizeRatio: 0.2, padding: 1, href: '', shape: 'square', plate: '#fff' });
    const naive = (0.2 * result.size) ** 2 / result.size ** 2;
    expect(cover.coverage).toBeGreaterThan(naive);
  });

  it('allows a logo under the ceiling and refuses one over it', async () => {
    const under = checkLogo(result.size, { sizeRatio: 0.1, padding: 0, href: '', shape: 'square', plate: '#fff' }, 'H');
    expect(under.ok).toBe(true);

    const over = checkLogo(result.size, { sizeRatio: 0.38, padding: 2, href: '', shape: 'square', plate: '#fff' }, 'H');
    expect(over.ok).toBe(false);
    expect(over.level).toBe('fail');
    expect(over.message).toMatch(/covers/i);
  });

  it('keeps every ceiling well below the nominal recovery budget', async () => {
    // The whole point: the budget also has to absorb print defects and dirt,
    // so the app must never spend all of it on decoration.
    const nominal = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
    for (const level of ['L', 'M', 'Q', 'H']) {
      for (const size of [21, 33, 57, 105]) {
        const ceiling = logoCeiling(level, size);
        expect(ceiling).toBeLessThan(nominal[level] * 0.7);
        expect(ceiling).toBeGreaterThan(nominal[level] * 0.3);
      }
    }
  });

  it('allows a bigger logo on a bigger code, because the damage spreads across more blocks', async () => {
    for (const level of ['L', 'M', 'Q', 'H']) {
      expect(logoCeiling(level, 85)).toBeGreaterThan(logoCeiling(level, 25));
    }
  });

  it('suggests the level a given logo actually needs', async () => {
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

  it('decodes at the coverage ceiling', async () => {
    // Find the largest logo the ceiling permits, then prove that one works.
    let permitted = 0.05;
    for (let r = 0.05; r <= 0.4; r += 0.01) {
      if (checkLogo(result.size, logo(r), 'H').ok) permitted = r;
    }
    const check = await verify(result.matrix, result.version, text, { style: { ...normaliseStyle({}).style, logo: logo(permitted) } });
    expect(check.pass, `a logo at the permitted ceiling (${permitted.toFixed(2)}) should still decode`).toBe(true);
  });

  it('fails the check well before the code becomes unreadable', async () => {
    // The guard is deliberately conservative, so there is a band where the
    // check refuses a logo that would in fact still scan in a clean render.
    // That is the intended safety margin, not a bug.
    const reckless = logo(0.45);
    expect(checkLogo(result.size, reckless, 'H').ok).toBe(false);
  });

  it('a genuinely oversized logo breaks the decode', async () => {
    const check = await verify(result.matrix, result.version, text, {
      style: { ...normaliseStyle({}).style, logo: logo(0.6) },
    });
    expect(check.pass).toBe(false);
  });
});

describe('module shapes keep the structural patterns intact', () => {
  it('classifies finders, timing and alignment correctly', async () => {
    const roles = classifyModules(7);
    expect(roles[0][0]).toBe('finder');
    expect(roles[3][3]).toBe('finder');
    expect(roles[6][10]).toBe('timing');
    expect(roles[10][6]).toBe('timing');
    expect(isStructural('finder')).toBe(true);
    expect(isStructural('timing')).toBe(true);
    expect(isStructural('data')).toBe(false);
  });

  it('decodes with every module shape', async () => {
    const result = encode(TEXT);
    for (const moduleShape of ['square', 'rounded', 'dot']) {
      const check = await verify(result.matrix, result.version, TEXT, {
        style: { ...normaliseStyle({}).style, moduleShape },
      });
      expect(check.pass, `${moduleShape} should still decode`).toBe(true);
    }
  });

  it('decodes with every corner shape the interface offers', async () => {
    const result = encode(TEXT);
    for (const pair of EYE_PAIRS) {
      const check = await verify(result.matrix, result.version, TEXT, {
        style: { ...normaliseStyle({}).style, eyeFrame: pair.frame, eyeBall: pair.ball },
      });
      expect(check.pass, `${pair.id} corners should still decode`).toBe(true);
    }
  });

  it('confirms the mismatched combinations that are deliberately not offered', async () => {
    // This is a regression guard on the reason EYE_PAIRS exists. A square ring
    // around a circular centre, or the reverse, breaks the 1:1:3:1:1 proportion
    // a scanner looks for on every scan line but the middle one. If this ever
    // starts passing, the rendering has changed and the restriction should be
    // re-measured rather than silently kept.
    const result = encode(TEXT);
    const mismatched = await verify(result.matrix, result.version, TEXT, {
      style: { ...normaliseStyle({}).style, eyeFrame: 'circle', eyeBall: 'square' },
    });
    expect(mismatched.pass).toBe(false);
  });
});

describe('finding the culprit when a style breaks the code', () => {
  it('names the offending choice rather than guessing', async () => {
    const result = encode(TEXT);
    const style = { ...normaliseStyle({}).style, foreground: '#CCCCCC', background: '#FFFFFF' };
    const check = await verify(result.matrix, result.version, TEXT, { style });
    expect(check.pass).toBe(false);

    const culprit = await findStyleCulprit(result.matrix, result.version, TEXT, style);
    expect(culprit).not.toBeNull();
    expect(culprit?.culprit).toBe('colors');

    // And the suggested revert must actually fix it.
    const fixed = await verify(result.matrix, result.version, TEXT, { style: { ...style, ...culprit.revert } });
    expect(fixed.pass).toBe(true);
  });

  it('returns null when nothing in the style is to blame', async () => {
    const result = encode(TEXT);
    const style = normaliseStyle({}).style;
    expect(await findStyleCulprit(result.matrix, result.version, TEXT, style)).toBeNull();
  });
});

describe('scaling the code so a logo does not break it', () => {
  const text = TEXT;
  const logoAt = (sizeRatio, padding = 1) => ({
    href: '',
    sizeRatio,
    padding,
    shape: 'square',
    plate: '#FFFFFF',
  });

  it('maxLogoRatio returns a size that actually passes the coverage check', () => {
    for (const ecc of ['L', 'M', 'Q', 'H']) {
      for (const size of [21, 25, 29, 33, 45, 77]) {
        const ratio = maxLogoRatio(size, ecc, 1);
        if (ratio <= 0) continue;
        const check = checkLogo(size, logoAt(ratio), ecc);
        expect(check.ok, `${ecc} at size ${size}, ratio ${ratio.toFixed(3)}`).toBe(true);
      }
    }
  });

  it('maxLogoRatio is the largest such size: one step bigger fails', () => {
    for (const ecc of ['M', 'Q', 'H']) {
      const size = 33;
      const ratio = maxLogoRatio(size, ecc, 1);
      // One whole module wider is over the line, since coverage counts whole
      // modules and the maximum is expressed in them.
      const bigger = ratio + 1.01 / size;
      expect(checkLogo(size, logoAt(bigger), ecc).ok, `${ecc} should refuse ${bigger.toFixed(3)}`).toBe(false);
    }
  });

  it('a logo at the maximum for its level still decodes', async () => {
    for (const ecc of ['Q', 'H']) {
      const result = encode(text, { ecc, boostEcc: false });
      const ratio = maxLogoRatio(result.size, ecc, 1);
      const check = await verify(result.matrix, result.version, text, {
        style: { ...normaliseStyle({}).style, logo: logoAt(ratio) },
      });
      expect(check.pass, `${ecc} at its maximum logo size (${ratio.toFixed(3)}) should decode`).toBe(true);
    }
  });

  it('raises the correction level rather than letting the logo break the code', () => {
    const size = 33;
    // Too big for Medium, fine for Quartile.
    const plan = planForLogo({ size, logo: logoAt(0.22), ecc: 'M' });
    expect(plan.raisedEcc).toBe(true);
    expect(['Q', 'H']).toContain(plan.ecc);
    expect(plan.shrankLogo).toBe(false);
    expect(plan.logo.sizeRatio).toBe(0.22);
    expect(plan.reason).toMatch(/Correction raised from Medium/);
    expect(checkLogo(size, plan.logo, plan.ecc).ok).toBe(true);
  });

  it('leaves a small logo and a sufficient level alone', () => {
    const size = 33;
    const plan = planForLogo({ size, logo: logoAt(0.1), ecc: 'H' });
    expect(plan.raisedEcc).toBe(false);
    expect(plan.shrankLogo).toBe(false);
    expect(plan.reason).toBeNull();
    expect(plan.ecc).toBe('H');
  });

  it('never lowers a level the user chose deliberately', () => {
    const plan = planForLogo({ size: 33, logo: logoAt(0.06), ecc: 'H' });
    expect(plan.ecc).toBe('H');
  });

  it('shrinks the logo only when even the highest level cannot carry it', () => {
    const size = 33;
    const plan = planForLogo({ size, logo: logoAt(0.6), ecc: 'M' });
    expect(plan.ecc).toBe('H');
    expect(plan.shrankLogo).toBe(true);
    expect(plan.logo.sizeRatio).toBeLessThan(0.6);
    expect(checkLogo(size, plan.logo, plan.ecc).ok).toBe(true);
    expect(plan.reason).toMatch(/scaled down/);
  });

  it('whatever the plan returns, the result always passes its own check', () => {
    for (const size of [21, 25, 33, 57]) {
      for (const ecc of ['L', 'M', 'Q', 'H']) {
        for (const ratio of [0.05, 0.12, 0.2, 0.3, 0.4]) {
          const plan = planForLogo({ size, logo: logoAt(ratio), ecc });
          expect(
            checkLogo(size, plan.logo, plan.ecc).ok,
            `size ${size}, ${ecc}, ratio ${ratio} produced a plan that fails its own check`,
          ).toBe(true);
        }
      }
    }
  });

  it('a planned logo decodes at the size the plan chose', async () => {
    const result = encode(text, { ecc: 'M', boostEcc: false });
    const plan = planForLogo({ size: result.size, logo: logoAt(0.45), ecc: 'M' });
    // Re-encode at the level the plan asked for, which is what the app does.
    const raised = encode(text, { ecc: plan.ecc, boostEcc: false });
    const check = await verify(raised.matrix, raised.version, text, {
      style: { ...normaliseStyle({}).style, logo: plan.logo },
    });
    expect(check.pass).toBe(true);
  });
});

describe('the ceiling is calibrated against real decoding, not guessed', () => {
  /*
    This is the test that earns the numbers in logoCeiling. The previous flat
    55%-of-budget figure passed every unit test and still produced logos that
    failed the scan test, because nothing checked the ceiling against an actual
    decode. This does.

    One payload per version band, so the sweep covers the small codes where a
    centre logo is most dangerous and the large ones where it is least.
  */
  const CASES = [
    ['https://a.co/x', 'a tiny code'],
    ['https://example.com/menu', 'a small code'],
    ['https://cafeauabuna.ro/meniu?masa=12', 'a typical code'],
    [`https://example.com/${'a'.repeat(60)}`, 'a long code'],
    [`https://example.com/${'a'.repeat(160)}`, 'a very long code'],
  ];

  for (const ecc of ['L', 'M', 'Q', 'H']) {
    for (const [text, label] of CASES) {
      it(`${label} at level ${ecc}: a logo at the ceiling still decodes`, async () => {
        const result = encode(text, { ecc, boostEcc: false });

        // Skip any code that cannot be read even without a logo: that is a
        // density problem the print panel reports, not a logo problem.
        const bare = await verify(result.matrix, result.version, text);
        if (!bare.pass) return;

        const ratio = maxLogoRatio(result.size, ecc, 1);
        if (ratio <= 0.04) return; // no room for a logo at all on this code

        const logo = { href: '', sizeRatio: ratio, padding: 1, shape: 'square', plate: '#FFFFFF' };
        const check = await verify(result.matrix, result.version, text, {
          style: { ...normaliseStyle({}).style, logo },
        });

        expect(
          check.pass,
          `v${result.version} ${ecc}: a logo at the ${(logoCeiling(ecc, result.size) * 100).toFixed(1)}% ceiling ` +
            `failed under ${check.failedIds.join(', ')}. The ceiling is too loose.`,
        ).toBe(true);
      });
    }
  }
});

describe('the decoder is told the right polarity', () => {
  /*
    Verification tells jsQR which way round the code is, to avoid paying for a
    failed attempt followed by an inverted retry. The mode names are not
    symmetrical: 'onlyInvert' sounds like the counterpart of 'dontInvert' and is
    not, so both directions are pinned here.
  */
  const text = TEXT;

  it('verifies a normal dark-on-light code', async () => {
    const result = encode(text);
    const check = await verify(result.matrix, result.version, text, { style: normaliseStyle({}).style });
    expect(check.pass).toBe(true);
  });

  it('still verifies a light-on-dark code, which the fast path must not break', async () => {
    const result = encode(text);
    const { style } = normaliseStyle({ foreground: '#FFFFFF', background: '#000000' });
    const check = await verify(result.matrix, result.version, text, { style });
    expect(check.pass, `inverted code failed under ${check.failedIds.join(', ')}`).toBe(true);
    for (const c of check.conditions) expect(c.got).toBe(text);
  });
});
