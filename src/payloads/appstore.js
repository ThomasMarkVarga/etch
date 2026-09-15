/**
 * App store link.
 *
 * This type exists mainly to give an honest answer to a question people ask a
 * lot: "can one code send iPhones to the App Store and Android phones to Play?"
 *
 * It cannot. A QR code is a fixed string of bytes. Sending two platforms to
 * two destinations requires something in the middle that looks at the request
 * and decides, which is a redirect, and a redirect is the single thing this app
 * refuses to create, because it is what makes a printed code stop working when
 * a subscription lapses.
 *
 * The workable answer is a page you control that does the branching, with your
 * own domain in the code. Then the redirect is yours, it costs nothing beyond
 * hosting you already have, and nobody can switch it off.
 */

/** @type {{value: string, label: string, hint: string}[]} */
export const STORES = [
  { value: 'apple', label: 'App Store', hint: 'apps.apple.com/…' },
  { value: 'google', label: 'Google Play', hint: 'play.google.com/store/apps/details?id=…' },
  { value: 'landing', label: 'A page on your own site', hint: 'example.com/app' },
];

/** @param {{store: string, url: string}} input @returns {string} */
export function buildAppStore(input) {
  return String(input.url ?? '').trim();
}

/** @param {{store: string, url: string}} input */
export function validateAppStore(input) {
  const out = [];
  const url = String(input.url ?? '').trim();
  if (!url) {
    out.push({ field: 'url', level: 'error', message: 'Paste the link to the app.' });
    return out;
  }
  if (input.store === 'apple' && !/apps\.apple\.com|itunes\.apple\.com/i.test(url)) {
    out.push({ field: 'url', level: 'warning', message: 'That does not look like an App Store link. They start with apps.apple.com.' });
  }
  if (input.store === 'google' && !/play\.google\.com/i.test(url)) {
    out.push({ field: 'url', level: 'warning', message: 'That does not look like a Google Play link. They start with play.google.com/store/apps/details.' });
  }
  if (input.store !== 'landing') {
    out.push({
      field: 'url',
      level: 'warning',
      message: 'A store link sends everyone to one store. Someone on the other platform reaches a page for an app they cannot install.',
    });
  }
  return out;
}

export const APPSTORE_EXAMPLE = { store: 'landing', url: 'https://example.com/app' };

export const APPSTORE_NOTE =
  'One code cannot send iPhones to the App Store and Android phones to Google Play. A QR code is a fixed string: choosing a destination based on the phone requires a redirect in the middle, and a redirect is exactly what this app will not make, because it is what stops a printed code from working once someone stops paying for it. Put a small page on your own domain that offers both links, or detects the platform, and encode that address instead. The redirect is then yours and nobody can switch it off.';

export const APPSTORE_SUPPORT =
  'A plain https link, so every phone camera opens it. Whether it lands in the store app or the browser is up to the phone.';
