/**
 * Hosts that shorten or redirect.
 *
 * The point of this list is not to shame anyone. Link shorteners and dynamic
 * QR services are legitimate products that do useful things, and some people
 * genuinely want editable destinations and scan statistics. The point is that
 * a printed code encoding a redirect has a dependency the person printing it
 * usually does not know about: the code outlives the paper it is on, but the
 * redirect only lasts as long as the service and, often, the subscription.
 *
 * The copy here is factual for that reason. Someone who finds out their menus
 * point at a dead redirect does not need a lecture.
 *
 * Categories:
 *   dynamic-qr  Sold as a QR service; the code encodes their domain, and the
 *               destination is editable and usually behind a subscription.
 *   shortener   General-purpose link shortener.
 *   social      A platform's own shortener, tied to that platform's lifetime.
 */

/**
 * @typedef {object} RedirectHost
 * @property {string} host
 * @property {'dynamic-qr'|'shortener'|'social'} kind
 * @property {string} name
 */

/** @type {RedirectHost[]} */
export const REDIRECT_HOSTS = [
  // Dynamic QR services: the code is theirs, the destination is a setting.
  { host: 'qrco.de', kind: 'dynamic-qr', name: 'QR Code Generator' },
  { host: 'qr1.be', kind: 'dynamic-qr', name: 'QR Code Generator' },
  { host: 'qrfy.com', kind: 'dynamic-qr', name: 'QRFY' },
  { host: 'qrs.ly', kind: 'dynamic-qr', name: 'QR Code Chimp' },
  { host: 'scnv.io', kind: 'dynamic-qr', name: 'Scanova' },
  { host: 'qrcd.org', kind: 'dynamic-qr', name: 'QR Code Dynamic' },
  { host: 'flowcode.com', kind: 'dynamic-qr', name: 'Flowcode' },
  { host: 'fl0.st', kind: 'dynamic-qr', name: 'Flowcode' },
  { host: 'uniqode.com', kind: 'dynamic-qr', name: 'Uniqode' },
  { host: 'beaconstac.com', kind: 'dynamic-qr', name: 'Uniqode (formerly Beaconstac)' },
  { host: 'qrplanet.com', kind: 'dynamic-qr', name: 'QR Planet' },
  { host: 'the-qrcode-generator.com', kind: 'dynamic-qr', name: 'The QR Code Generator' },
  { host: 'qrcodes.pro', kind: 'dynamic-qr', name: 'QR Codes Pro' },
  { host: 'linkqr.io', kind: 'dynamic-qr', name: 'LinkQR' },
  { host: 'qrco.io', kind: 'dynamic-qr', name: 'QR Code Generator' },
  { host: 'q-r.to', kind: 'dynamic-qr', name: 'QR Code Monkey' },

  // General shorteners.
  { host: 'bit.ly', kind: 'shortener', name: 'Bitly' },
  { host: 'bitly.com', kind: 'shortener', name: 'Bitly' },
  { host: 'tinyurl.com', kind: 'shortener', name: 'TinyURL' },
  { host: 'rebrand.ly', kind: 'shortener', name: 'Rebrandly' },
  { host: 'short.io', kind: 'shortener', name: 'Short.io' },
  { host: 'shorturl.at', kind: 'shortener', name: 'ShortURL' },
  { host: 'cutt.ly', kind: 'shortener', name: 'Cuttly' },
  { host: 'is.gd', kind: 'shortener', name: 'is.gd' },
  { host: 'v.gd', kind: 'shortener', name: 'v.gd' },
  { host: 'ow.ly', kind: 'shortener', name: 'Hootsuite' },
  { host: 'buff.ly', kind: 'shortener', name: 'Buffer' },
  { host: 'lnkd.in', kind: 'social', name: 'LinkedIn' },
  { host: 't.co', kind: 'social', name: 'X, formerly Twitter' },
  { host: 'fb.me', kind: 'social', name: 'Facebook' },
  { host: 'youtu.be', kind: 'social', name: 'YouTube' },
  { host: 'g.co', kind: 'social', name: 'Google' },
  { host: 'goo.gl', kind: 'shortener', name: 'Google, discontinued' },
  { host: 'linktr.ee', kind: 'social', name: 'Linktree' },
  { host: 'tiny.cc', kind: 'shortener', name: 'tiny.cc' },
  { host: 'trib.al', kind: 'shortener', name: 'Tribal' },
  { host: 'mcaf.ee', kind: 'shortener', name: 'McAfee' },
  { host: 'db.tt', kind: 'shortener', name: 'Dropbox, discontinued' },
  { host: 'adf.ly', kind: 'shortener', name: 'AdFly' },
  { host: 's.id', kind: 'shortener', name: 's.id' },
  { host: 'shorturl.com', kind: 'shortener', name: 'ShortURL' },
  { host: 'urlz.fr', kind: 'shortener', name: 'urlz.fr' },
  { host: 'l.ead.me', kind: 'shortener', name: 'Leadme' },
  { host: 'qr.page', kind: 'dynamic-qr', name: 'QR.page' },
];

/**
 * Find the entry matching a hostname, including subdomains.
 * @param {string} hostname
 * @returns {RedirectHost|null}
 */
export function matchRedirectHost(hostname) {
  const h = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  if (!h) return null;
  return REDIRECT_HOSTS.find((e) => h === e.host || h.endsWith(`.${e.host}`)) ?? null;
}

/**
 * One factual sentence about what a host is.
 * @param {RedirectHost} entry
 * @returns {string}
 */
export function describeHost(entry) {
  switch (entry.kind) {
    case 'dynamic-qr':
      return `${entry.host} belongs to ${entry.name}, a dynamic QR service: the code holds their address and they forward it to yours.`;
    case 'social':
      return `${entry.host} is ${entry.name}'s own link shortener, so the link lasts as long as that service keeps it working.`;
    default:
      return `${entry.host} is a link shortener run by ${entry.name}: the code holds their address and they forward it to yours.`;
  }
}

/**
 * The longevity consequence, written for someone deciding whether to reprint.
 * @param {RedirectHost} entry
 * @returns {string}
 */
export function longevityNote(entry) {
  if (entry.kind === 'dynamic-qr') {
    return 'Being able to change the destination later is genuinely useful, and it is what you are paying for. The trade is that the printed code depends on that account staying active. If the subscription lapses or the company shuts down, every copy you printed stops working, and no reprint of the same pattern will fix it. Codes on things you cannot easily reprint are the ones to think hardest about.';
  }
  return 'Shorteners are convenient and most of the big ones have been around a long time, but they do close: Google shut goo.gl to new links in 2019 and began winding down existing ones in 2024, and Dropbox retired db.tt. A printed code pointing at a shortener depends on that company continuing to run a redirect for free.';
}
