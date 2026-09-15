import { describe, it, expect } from 'vitest';
import { buildWifi, escapeWifi, validateWifi } from '../wifi.js';
import { encode } from '../../core/encode.js';
import { verify } from '../../core/verify.js';

/**
 * Wi-Fi escaping.
 *
 * The characters \ ; , : and " are special inside a WIFI: payload and must each
 * be escaped with a backslash. This is where most generators break, and the
 * failure is nasty: an unescaped semicolon ends the password field early, so
 * the code looks fine, scans fine, and joins with the wrong password.
 *
 * Written with String.fromCharCode(92) rather than literal backslashes in the
 * expectations, because a test full of quadruple backslashes is a test nobody
 * can check by eye.
 */

const BS = String.fromCharCode(92);

describe('escapeWifi', () => {
  const cases = [
    ['plain', 'hunter2', 'hunter2'],
    ['semicolon', 'pass;word', `pass${BS};word`],
    ['backslash', `pass${BS}word`, `pass${BS}${BS}word`],
    ['comma', 'pass,word', `pass${BS},word`],
    ['colon', 'pass:word', `pass${BS}:word`],
    ['double quote', 'pass"word', `pass${BS}"word`],
    ['all five at once', `a${BS}b;c,d:e"f`, `a${BS}${BS}b${BS};c${BS},d${BS}:e${BS}"f`],
    ['a backslash already before a semicolon', `a${BS};b`, `a${BS}${BS}${BS};b`],
    ['empty', '', ''],
  ];

  for (const [label, input, expected] of cases) {
    it(`escapes ${label}`, () => {
      expect(escapeWifi(input)).toBe(expected);
    });
  }

  it('escapes each special character exactly once', () => {
    // A double-escaping bug is just as broken as no escaping, and much harder
    // to spot, because the code still scans and just joins with the wrong key.
    const escaped = escapeWifi('a;b');
    expect(escaped).toBe(`a${BS};b`);
    expect(escaped.split(BS).length - 1).toBe(1);
  });
});

describe('buildWifi', () => {
  it('produces the canonical shape', () => {
    expect(buildWifi({ ssid: 'MyNet', password: 'hunter22', auth: 'WPA' })).toBe('WIFI:T:WPA;S:MyNet;P:hunter22;;');
  });

  it('omits the password field entirely for an open network', () => {
    const out = buildWifi({ ssid: 'FreeWiFi', auth: 'nopass', password: 'ignored' });
    expect(out).toBe('WIFI:T:nopass;S:FreeWiFi;;');
    expect(out).not.toContain('ignored');
    expect(out).not.toContain('P:');
  });

  it('marks a hidden network', () => {
    expect(buildWifi({ ssid: 'Hidden', password: 'hunter22', auth: 'WPA', hidden: true })).toBe(
      'WIFI:T:WPA;S:Hidden;P:hunter22;H:true;;',
    );
  });

  it('escapes specials in both the name and the password', () => {
    const out = buildWifi({ ssid: 'Cafe; Bar', password: `p:a${BS}ss`, auth: 'WPA' });
    expect(out).toBe(`WIFI:T:WPA;S:Cafe${BS}; Bar;P:p${BS}:a${BS}${BS}ss;;`);
  });

  it('quotes an all-hex value so it is not read as raw hex', () => {
    // The specification says a bare hex string may be interpreted as hex bytes
    // rather than as text, so it has to be quoted to force the literal reading.
    const out = buildWifi({ ssid: 'DEADBEEF', password: '12345678', auth: 'WPA' });
    expect(out).toContain('S:"DEADBEEF"');
    expect(out).toContain('P:"12345678"');
  });

  it('does not quote a value containing any non-hex character', () => {
    // "Cafe123" would be quoted, because every one of those characters is a
    // hex digit. "CafeWiFi" has a W in it and so is unambiguous text.
    const out = buildWifi({ ssid: 'CafeWiFi', password: 'parola123', auth: 'WPA' });
    expect(out).toContain('S:CafeWiFi;');
    expect(out).not.toContain('"CafeWiFi"');
  });

  it('escapes inside the quotes rather than escaping the quotes', () => {
    // Regression guard: escaping after quoting turns S:"DEAD" into S:\"DEAD\",
    // which is a value with literal quote characters in it, not a quoted value.
    const out = buildWifi({ ssid: 'DEADBEEF', password: 'abcdef12', auth: 'WPA' });
    expect(out).toContain('S:"DEADBEEF"');
    expect(out).not.toContain(`${BS}"`);
  });

  it('always terminates with a double semicolon', () => {
    for (const input of [
      { ssid: 'A', password: 'bbbbbbbb', auth: 'WPA' },
      { ssid: 'A', auth: 'nopass' },
      { ssid: 'A', password: 'bbbbbbbb', auth: 'WPA', hidden: true },
    ]) {
      expect(buildWifi(input).endsWith(';;')).toBe(true);
    }
  });
});

describe('a Wi-Fi payload with nasty characters survives the round trip', () => {
  const nasty = [
    ['semicolons and backslashes', { ssid: 'Cafeaua Bună', password: `Latte;2024${BS}Vanilla`, auth: 'WPA' }],
    ['every special character', { ssid: `A${BS}B;C,D:E"F`, password: `p${BS}a;s,s:w"d`, auth: 'WPA' }],
    ['diacritics in the network name', { ssid: 'Rețeaua Șefului', password: 'parolă123', auth: 'WPA' }],
    ['emoji in the network name', { ssid: 'Cafe ☕ WiFi', password: 'hunter22', auth: 'WPA' }],
    ['a hidden network', { ssid: 'Ascuns', password: 'secret123', auth: 'WPA', hidden: true }],
    ['an open network', { ssid: 'Gratis', auth: 'nopass' }],
  ];

  for (const [label, input] of nasty) {
    it(label, () => {
      const payload = buildWifi(input);
      const result = encode(payload);
      const check = verify(result.matrix, result.version, payload);
      expect(check.pass, `failed under ${check.failedIds.join(', ')}`).toBe(true);
      for (const c of check.conditions) expect(c.got).toBe(payload);
    });
  }

  it('an escaped password can be parsed back to the original', () => {
    // The real proof: unescape the field and get the original string back.
    const password = `Latte;2024${BS}Vanilla`;
    const payload = buildWifi({ ssid: 'Test', password, auth: 'WPA' });
    const field = /(?:^|;)P:((?:\\.|[^;])*)/.exec(payload)?.[1] ?? '';
    const unescaped = field.replace(/\\(.)/g, '$1');
    expect(unescaped).toBe(password);
  });
});

describe('validation', () => {
  it('requires a network name', () => {
    expect(validateWifi({ ssid: '', password: 'hunter22' }).some((i) => i.field === 'ssid' && i.level === 'error')).toBe(true);
  });

  it('measures the name in bytes, not characters', () => {
    // 32 bytes is the limit, and an accented character costs two.
    const seventeenAccented = 'ă'.repeat(17); // 34 bytes
    expect(seventeenAccented.length).toBe(17);
    const issues = validateWifi({ ssid: seventeenAccented, password: 'hunter22' });
    expect(issues.some((i) => i.field === 'ssid' && i.level === 'error')).toBe(true);
  });

  it('warns about a WPA password shorter than 8 characters', () => {
    const issues = validateWifi({ ssid: 'Net', password: 'short', auth: 'WPA' });
    expect(issues.some((i) => i.field === 'password' && i.level === 'warning')).toBe(true);
  });

  it('does not demand a password for an open network', () => {
    const issues = validateWifi({ ssid: 'Free', auth: 'nopass' });
    expect(issues.some((i) => i.field === 'password')).toBe(false);
  });

  it('warns that hidden networks are unreliable', () => {
    const issues = validateWifi({ ssid: 'Net', password: 'hunter22', auth: 'WPA', hidden: true });
    expect(issues.some((i) => i.field === 'hidden')).toBe(true);
  });
});
