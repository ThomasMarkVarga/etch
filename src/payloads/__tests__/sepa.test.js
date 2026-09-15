import { describe, it, expect } from 'vitest';
import { buildSepa, validateSepa, validateIban, normaliseIban, SEPA_MAX_BYTES } from '../sepa.js';
import { encode } from '../../core/encode.js';
import { verify } from '../../core/verify.js';

/**
 * SEPA credit transfer, EPC069-12.
 *
 * Two things must hold absolutely. The field order is positional, so a missing
 * line shifts every field below it and a bank app reads the amount as a purpose
 * code. And the IBAN must be checked with its own mod-97 checksum, because that
 * checksum exists precisely to catch the mistyped character that would
 * otherwise send money to a valid-looking account that is not the right one.
 */

describe('IBAN validation uses the checksum, not a regex', () => {
  // Published example IBANs from the ISO 13616 registry and bank documentation.
  const VALID = [
    ['RO49AAAA1B31007593840000', 'RO'],
    ['DE89370400440532013000', 'DE'],
    ['GB29NWBK60161331926819', 'GB'],
    ['FR1420041010050500013M02606', 'FR'],
    ['NL91ABNA0417164300', 'NL'],
    ['IT60X0542811101000000123456', 'IT'],
    ['ES9121000418450200051332', 'ES'],
    ['BE68539007547034', 'BE'],
  ];

  for (const [iban, country] of VALID) {
    it(`accepts a valid ${country} IBAN`, () => {
      const check = validateIban(iban);
      expect(check.valid, `${iban} should be valid`).toBe(true);
      expect(check.country).toBe(country);
    });
  }

  it('accepts an IBAN with the usual spacing', () => {
    expect(validateIban('RO49 AAAA 1B31 0075 9384 0000').valid).toBe(true);
    expect(normaliseIban('ro49 aaaa 1b31 0075 9384 0000')).toBe('RO49AAAA1B31007593840000');
  });

  it('rejects a single transposed character, which a regex would allow', () => {
    // Same length, same shape, same country: only the checksum catches this.
    const good = 'DE89370400440532013000';
    const typo = 'DE89370400440532013100';
    expect(validateIban(good).valid).toBe(true);
    const bad = validateIban(typo);
    expect(bad.valid).toBe(false);
    expect(bad.reason).toBe('checksum');
  });

  it('rejects wrong check digits', () => {
    expect(validateIban('RO50AAAA1B31007593840000').reason).toBe('checksum');
  });

  it('rejects the wrong length for the country', () => {
    expect(validateIban('DE8937040044053201300').reason).toBe('length');
  });

  it('rejects an unknown country code', () => {
    expect(validateIban('ZZ89370400440532013000').reason).toBe('country');
  });

  it('rejects malformed input', () => {
    expect(validateIban('').reason).toBe('empty');
    expect(validateIban('not an iban').reason).toBe('shape');
    expect(validateIban('1234567890').reason).toBe('shape');
  });
});

describe('field order is exact', () => {
  it('writes the twelve fields in the order the specification defines', () => {
    const payload = buildSepa({
      name: 'Atelier Lemn SRL',
      iban: 'RO49AAAA1B31007593840000',
      bic: 'BTRLRO22',
      amount: '149.5',
      remittance: 'Factura 2026-114',
      version: '002',
    });
    const lines = payload.split('\n');
    expect(lines[0]).toBe('BCD');
    expect(lines[1]).toBe('002');
    expect(lines[2]).toBe('1'); // UTF-8
    expect(lines[3]).toBe('SCT');
    expect(lines[4]).toBe('BTRLRO22');
    expect(lines[5]).toBe('Atelier Lemn SRL');
    expect(lines[6]).toBe('RO49AAAA1B31007593840000');
    expect(lines[7]).toBe('EUR149.50');
    expect(lines[8]).toBe(''); // purpose
    expect(lines[9]).toBe(''); // structured reference
    expect(lines[10]).toBe('Factura 2026-114');
  });

  it('keeps empty fields in the middle rather than collapsing them', () => {
    // This is the failure that matters: dropping the empty BIC line would move
    // the name into the BIC slot and the IBAN into the name slot.
    const payload = buildSepa({
      name: 'Test SRL',
      iban: 'RO49AAAA1B31007593840000',
      bic: '',
      amount: '',
      remittance: 'Ref',
    });
    const lines = payload.split('\n');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('Test SRL');
    expect(lines[6]).toBe('RO49AAAA1B31007593840000');
    expect(lines[7]).toBe('');
    expect(lines[10]).toBe('Ref');
  });

  it('uses LF line endings, not CRLF', () => {
    const payload = buildSepa({ name: 'A', iban: 'RO49AAAA1B31007593840000' });
    expect(payload).not.toContain('\r');
  });

  it('formats the amount with the EUR prefix and two decimals', () => {
    // A remittance keeps the amount from being a trailing field, so the line is
    // always present and position 7 is always the amount.
    const amount = (v) =>
      buildSepa({ name: 'A', iban: 'RO49AAAA1B31007593840000', amount: v, remittance: 'Ref' }).split('\n')[7];
    expect(amount('149.5')).toBe('EUR149.50');
    expect(amount('149,50')).toBe('EUR149.50'); // a European decimal comma
    expect(amount(10)).toBe('EUR10.00');
    expect(amount('')).toBe('');
    expect(amount(0)).toBe('');
  });

  it('omits trailing empty fields, which the specification permits', () => {
    // Trailing only. An empty field with a populated field after it must stay,
    // because dropping one would shift every field below it by a line.
    const bare = buildSepa({ name: 'A', iban: 'RO49AAAA1B31007593840000' });
    expect(bare.split('\n').length).toBe(7);
    expect(bare.endsWith('RO49AAAA1B31007593840000')).toBe(true);

    const withNote = buildSepa({ name: 'A', iban: 'RO49AAAA1B31007593840000', remittance: 'Ref' });
    expect(withNote.split('\n')[7]).toBe('');
  });

  it('uses the structured reference and drops the free-text note when both are set', () => {
    const payload = buildSepa({
      name: 'A',
      iban: 'RO49AAAA1B31007593840000',
      reference: 'RF18539007547034',
      remittance: 'should not appear',
    });
    const lines = payload.split('\n');
    expect(lines[9]).toBe('RF18539007547034');
    expect(lines[10] ?? '').toBe('');
    expect(payload).not.toContain('should not appear');
  });
});

describe('validation', () => {
  const base = { name: 'Atelier Lemn SRL', iban: 'RO49AAAA1B31007593840000', version: '002' };

  it('accepts a well-formed payment', () => {
    expect(validateSepa({ ...base, amount: '149.50' }).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('requires a beneficiary name', () => {
    expect(validateSepa({ ...base, name: '' }).some((i) => i.field === 'name' && i.level === 'error')).toBe(true);
  });

  it('caps the name at 70 characters', () => {
    expect(validateSepa({ ...base, name: 'x'.repeat(71) }).some((i) => i.field === 'name' && i.level === 'error')).toBe(true);
  });

  it('explains a failed checksum in plain language', () => {
    const issue = validateSepa({ ...base, iban: 'RO50AAAA1B31007593840000' }).find((i) => i.field === 'iban');
    expect(issue?.level).toBe('error');
    expect(issue?.message).toMatch(/check digits/i);
  });

  it('requires a BIC for version 001 but not for 002', () => {
    expect(validateSepa({ ...base, version: '001', bic: '' }).some((i) => i.field === 'bic' && i.level === 'error')).toBe(true);
    expect(validateSepa({ ...base, version: '002', bic: '' }).some((i) => i.field === 'bic' && i.level === 'error')).toBe(false);
  });

  it('rejects a malformed BIC', () => {
    expect(validateSepa({ ...base, bic: 'NOTABIC1' }).some((i) => i.field === 'bic' && i.level === 'error')).toBe(false);
    expect(validateSepa({ ...base, bic: 'SHORT' }).some((i) => i.field === 'bic' && i.level === 'error')).toBe(true);
  });

  it('rejects an amount over the format maximum', () => {
    expect(validateSepa({ ...base, amount: '1000000000' }).some((i) => i.field === 'amount' && i.level === 'error')).toBe(true);
  });

  it('rejects a note over 140 characters', () => {
    expect(
      validateSepa({ ...base, remittance: 'x'.repeat(141) }).some((i) => i.field === 'remittance' && i.level === 'error'),
    ).toBe(true);
  });

  it('rejects a payload over the 331 byte limit', () => {
    const issues = validateSepa({ ...base, name: 'ă'.repeat(70), remittance: 'ș'.repeat(140), reference: '' });
    const size = new TextEncoder().encode(buildSepa({ ...base, name: 'ă'.repeat(70), remittance: 'ș'.repeat(140) })).length;
    expect(size).toBeGreaterThan(SEPA_MAX_BYTES);
    expect(issues.some((i) => i.level === 'error' && i.message.includes(String(SEPA_MAX_BYTES)))).toBe(true);
  });
});

describe('round trip', () => {
  it('a payment code decodes back byte for byte', () => {
    const payload = buildSepa({
      name: 'Atelier Lemn și Piatră',
      iban: 'RO49AAAA1B31007593840000',
      amount: '149.50',
      remittance: 'Factura 2026-114',
    });
    const result = encode(payload, { ecc: 'M' });
    const check = verify(result.matrix, result.version, payload);
    expect(check.pass).toBe(true);
    for (const c of check.conditions) expect(c.got).toBe(payload);
  });

  it('stays inside the size limit at the maximum realistic content', () => {
    const payload = buildSepa({
      name: 'A'.repeat(70),
      iban: 'RO49AAAA1B31007593840000',
      bic: 'BTRLRO22',
      amount: '999999999.99',
      remittance: 'B'.repeat(140),
    });
    expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(SEPA_MAX_BYTES);
  });
});
