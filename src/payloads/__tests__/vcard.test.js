import { describe, it, expect } from 'vitest';
import { buildVCard, escapeVCard, validateContact } from '../vcard.js';
import { buildMeCard, escapeMeCard } from '../mecard.js';
import { buildVEvent, escapeIcal, formatIcalDate } from '../vevent.js';
import { buildEmail, encodeComponent } from '../email.js';
import { buildSms } from '../sms.js';
import { buildGeo } from '../geo.js';
import { buildTel, normaliseNumber } from '../tel.js';
import { encode } from '../../core/encode.js';
import { verify } from '../../core/verify.js';

const BS = String.fromCharCode(92);

/**
 * Contact and calendar formats.
 *
 * These are structured formats where the separator characters are also
 * characters people legitimately put in their data. A surname with a semicolon
 * or a company with a comma shifts every field after it if it is not escaped,
 * and the resulting card imports with a mangled name and no phone number.
 */

describe('vCard escaping', () => {
  it('escapes backslash, semicolon, comma and newline', () => {
    expect(escapeVCard(`a${BS}b`)).toBe(`a${BS}${BS}b`);
    expect(escapeVCard('a;b')).toBe(`a${BS};b`);
    expect(escapeVCard('a,b')).toBe(`a${BS},b`);
    expect(escapeVCard('a\nb')).toBe(`a${BS}nb`);
    expect(escapeVCard('a\r\nb')).toBe(`a${BS}nb`);
  });

  it('leaves the colon alone, which vCard does not escape', () => {
    // Unlike meCard. Getting these two confused is a common source of bugs.
    expect(escapeVCard('a:b')).toBe('a:b');
  });

  it('keeps a semicolon in a surname from shifting the structured N field', () => {
    const card = buildVCard({ firstName: 'Ana', lastName: 'Popescu; Ionescu' });
    const n = card.split('\r\n').find((l) => l.startsWith('N:'));
    expect(n).toBe(`N:Popescu${BS}; Ionescu;Ana;;;`);
    // Five fields means four unescaped semicolons, no more.
    expect((n.slice(2).match(/(?<!\\);/g) ?? []).length).toBe(4);
  });
});

describe('vCard structure', () => {
  const contact = {
    firstName: 'Ana',
    lastName: 'Popescu-Ionescu',
    organisation: 'Atelier Lemn & Piatră',
    title: 'Furniture maker',
    mobile: '+40 722 123 456',
    email: 'ana@example.com',
    website: 'https://example.com',
    city: 'Cluj-Napoca',
    country: 'Romania',
  };

  it('opens and closes correctly, at version 3.0', () => {
    const card = buildVCard(contact);
    const lines = card.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCARD');
    expect(lines[1]).toBe('VERSION:3.0');
    expect(lines[lines.length - 1]).toBe('END:VCARD');
  });

  it('uses CRLF, as the specification requires', () => {
    expect(buildVCard(contact)).toContain('\r\n');
    expect(buildVCard(contact).split('\r\n').join('')).not.toContain('\n');
  });

  it('writes a formatted name as well as the structured one', () => {
    const card = buildVCard(contact);
    expect(card).toContain('FN:Ana Popescu-Ionescu');
    expect(card).toContain('N:Popescu-Ionescu;Ana;;;');
  });

  it('writes the address with seven structured components', () => {
    const card = buildVCard(contact);
    const adr = card.split('\r\n').find((l) => l.startsWith('ADR'));
    expect(adr).toBeDefined();
    expect(adr.split(':')[1].split(';').length).toBe(7);
  });

  it('omits fields that were not filled in', () => {
    const card = buildVCard({ firstName: 'Ana' });
    expect(card).not.toContain('ORG:');
    expect(card).not.toContain('TEL');
    expect(card).not.toContain('ADR');
  });

  it('falls back to the organisation when there is no personal name', () => {
    expect(buildVCard({ organisation: 'Atelier SRL' })).toContain('FN:Atelier SRL');
  });
});

describe('meCard escaping differs from vCard, on purpose', () => {
  it('escapes the colon, which vCard does not', () => {
    expect(escapeMeCard('a:b')).toBe(`a${BS}:b`);
    expect(escapeVCard('a:b')).toBe('a:b');
  });

  it('keeps the name separator comma unescaped while escaping commas in values', () => {
    const card = buildMeCard({ firstName: 'Ana', lastName: 'Popescu, Jr' });
    expect(card).toContain(`N:Popescu${BS}, Jr,Ana;`);
  });

  it('terminates with a double semicolon', () => {
    expect(buildMeCard({ firstName: 'Ana', lastName: 'Pop' }).endsWith(';;')).toBe(true);
  });

  it('produces a shorter payload than vCard, which is its whole reason to exist', () => {
    const contact = { firstName: 'Ana', lastName: 'Pop', mobile: '+40722123456', email: 'a@b.com' };
    expect(buildMeCard(contact).length).toBeLessThan(buildVCard(contact).length);
  });
});

describe('calendar events', () => {
  it('escapes commas in a location so it is not read as two locations', () => {
    const event = buildVEvent({ summary: 'Târg', location: 'Strada Mare 12, Cluj', start: '2026-12-04T17:00' });
    expect(event).toContain(`LOCATION:Strada Mare 12${BS}, Cluj`);
  });

  it('writes floating local time by default, so a poster means what it says', () => {
    const event = buildVEvent({ summary: 'X', start: '2026-12-04T17:00', utc: false });
    expect(event).toContain('DTSTART:20261204T170000');
    expect(event).not.toContain('DTSTART:20261204T170000Z');
  });

  it('writes UTC only when explicitly asked', () => {
    const event = buildVEvent({ summary: 'X', start: '2026-12-04T17:00', utc: true });
    expect(event).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('writes an all-day event as a date value', () => {
    const event = buildVEvent({ summary: 'X', start: '2026-12-04', allDay: true });
    expect(event).toContain('DTSTART;VALUE=DATE:20261204');
  });

  it('formats dates without a separator', () => {
    expect(formatIcalDate('2026-12-04T17:30', false)).toBe('20261204T173000');
    expect(formatIcalDate('2026-12-04', false)).toBe('20261204');
    expect(formatIcalDate('', false)).toBeNull();
  });

  it('wraps the event in a calendar', () => {
    const event = buildVEvent({ summary: 'X', start: '2026-12-04T17:00' });
    expect(event.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(event.endsWith('END:VCALENDAR')).toBe(true);
    expect(event).toContain('BEGIN:VEVENT');
    expect(event).toContain('VERSION:2.0');
  });

  it('escapes backslashes and semicolons in a description', () => {
    expect(escapeIcal(`a${BS}b;c,d`)).toBe(`a${BS}${BS}b${BS};c${BS},d`);
  });
});

describe('mailto and the other URI formats', () => {
  it('percent-encodes the reserved sub-delimiters encodeURIComponent misses', () => {
    expect(encodeComponent("it's (a) test!*")).toBe('it%27s%20%28a%29%20test%21%2A');
  });

  it('builds a mailto with encoded subject and body', () => {
    const out = buildEmail({ to: 'a@example.com', subject: 'Table booking', body: 'Hi there & thanks' });
    expect(out).toContain('mailto:a%40example.com@example.com'.slice(0, 7));
    expect(out).toContain('subject=Table%20booking');
    expect(out).toContain('body=Hi%20there%20%26%20thanks');
  });

  it('keeps the at sign readable in the address', () => {
    expect(buildEmail({ to: 'ana@example.com' })).toBe('mailto:ana@example.com');
  });

  it('uses the RFC form for SMS by default and SMSTO only when asked', () => {
    expect(buildSms({ number: '+40722123456', message: 'STOP' })).toBe('sms:+40722123456?body=STOP');
    expect(buildSms({ number: '+40722123456', message: 'STOP', format: 'smsto' })).toBe('SMSTO:+40722123456:STOP');
  });

  it('strips formatting from phone numbers but keeps the leading plus', () => {
    expect(normaliseNumber('+40 (722) 123-456')).toBe('+40722123456');
    expect(normaliseNumber('0722 123 456')).toBe('0722123456');
    // A plus that is not at the start is a typo, not a second country code.
    expect(normaliseNumber('+40+722')).toBe('+40722');
    expect(buildTel({ number: '+40 722 123 456' })).toBe('tel:+40722123456');
  });

  it('trims geo coordinates to a sane precision', () => {
    expect(buildGeo({ latitude: '44.4268000', longitude: '26.1025000' })).toBe('geo:44.4268,26.1025');
    expect(buildGeo({ latitude: 44.42681234567, longitude: 26.10251234567 })).toBe('geo:44.426812,26.102512');
  });
});

describe('round trip for contact and event payloads', () => {
  const cases = [
    [
      'a vCard with diacritics and punctuation',
      buildVCard({
        firstName: 'Ana-Maria',
        lastName: 'Popescu; Ionescu',
        organisation: 'Atelier Lemn & Piatră, SRL',
        mobile: '+40 722 123 456',
        email: 'ana@example.com',
        city: 'Cluj-Napoca',
      }),
    ],
    ['a meCard with a comma in the surname', buildMeCard({ firstName: 'Ana', lastName: 'Popescu, Jr', mobile: '+40722123456' })],
    [
      'an event with a comma in the location',
      buildVEvent({ summary: 'Târg de Crăciun', location: 'Piața Unirii, Cluj-Napoca', start: '2026-12-04T17:00', end: '2026-12-04T22:00' }),
    ],
    ['an email with an encoded body', buildEmail({ to: 'ana@example.com', subject: 'Rezervare', body: "Bună! O masă pentru 4?" })],
  ];

  for (const [label, payload] of cases) {
    it(label, () => {
      const result = encode(payload);
      const check = verify(result.matrix, result.version, payload);
      expect(check.pass, `failed under ${check.failedIds.join(', ')}`).toBe(true);
      for (const c of check.conditions) expect(c.got).toBe(payload);
    });
  }
});

describe('contact validation', () => {
  it('requires something identifying', () => {
    expect(validateContact({}).some((i) => i.level === 'error')).toBe(true);
    expect(validateContact({ organisation: 'Atelier' }).some((i) => i.level === 'error')).toBe(false);
  });

  it('warns when there is no way to contact the person', () => {
    expect(validateContact({ firstName: 'Ana' }).some((i) => i.field === 'phone' && i.level === 'warning')).toBe(true);
  });

  it('warns about a website with no scheme', () => {
    expect(
      validateContact({ firstName: 'Ana', email: 'a@b.com', website: 'example.com' }).some((i) => i.field === 'website'),
    ).toBe(true);
  });
});
