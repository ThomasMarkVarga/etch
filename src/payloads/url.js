/**
 * Web address.
 *
 * The most common payload by far, and the one where the promise of this app
 * matters most: a static code holds your address, so it keeps working with no
 * company in the middle. The honest limit is stated in the verification panel,
 * because the code is permanent and the domain registration is not.
 */

import { REDIRECT_HOSTS, describeHost } from '../inspector/redirectHosts.js';

/** @param {{url: string}} input @returns {string} */
export function buildUrl(input) {
  return String(input.url ?? '').trim();
}

/**
 * Parse leniently: people type example.com, not https://example.com.
 * @param {string} raw
 */
export function parseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, hadScheme: false, url: null, host: null };
  const hadScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  try {
    const url = new URL(hadScheme ? text : `https://${text}`);
    return { ok: true, hadScheme, url, host: url.hostname };
  } catch {
    return { ok: false, hadScheme, url: null, host: null };
  }
}

/** @param {{url: string}} input */
export function validateUrl(input) {
  const out = [];
  const raw = String(input.url ?? '').trim();
  if (!raw) {
    out.push({ field: 'url', level: 'error', message: 'Enter the address you want the code to open.' });
    return out;
  }

  const parsed = parseUrl(raw);
  if (!parsed.ok) {
    out.push({ field: 'url', level: 'error', message: 'That does not look like a web address. It should look like example.com/menu.' });
    return out;
  }

  if (!parsed.hadScheme) {
    out.push({
      field: 'url',
      level: 'warning',
      message:
        'This has no https:// in front. Phone cameras add it, but some older scanners will treat it as plain text and open nothing. Adding https:// makes the code slightly bigger and a lot more predictable.',
    });
  } else if (parsed.url && parsed.url.protocol === 'http:') {
    out.push({
      field: 'url',
      level: 'warning',
      message:
        'This is a plain http:// address. Browsers increasingly warn on these, and that warning will still be there years after the code is printed.',
    });
  }

  const host = parsed.host ?? '';
  const known = REDIRECT_HOSTS.find((h) => host === h.host || host.endsWith(`.${h.host}`));
  if (known) {
    out.push({
      field: 'url',
      level: 'warning',
      message: `${describeHost(known)} The code will be permanent either way, but it points at ${known.host} rather than at you, so it stops working if that service does. Encoding your own address avoids that.`,
    });
  }

  if (raw.length > 120) {
    out.push({
      field: 'url',
      level: 'warning',
      message: `This address is ${raw.length} characters, which makes a dense code with small squares. A shorter path on your own domain would print smaller and scan better.`,
    });
  }

  if (/[-￿]/.test(raw)) {
    out.push({
      field: 'url',
      level: 'warning',
      message:
        'This address contains accented or non-Latin characters. It is encoded exactly as typed; if the link does not open, use the percent-encoded form your browser shows in the address bar.',
    });
  }

  return out;
}

export const URL_EXAMPLE = { url: 'https://example.com/menu' };

export const URL_SUPPORT =
  'Read by every phone camera and every scanner app. This is the best-supported payload type there is.';
