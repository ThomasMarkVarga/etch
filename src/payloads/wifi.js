/**
 * Wi-Fi network payload.
 *
 * Format: WIFI:T:<auth>;S:<ssid>;P:<password>;H:<hidden>;;
 *
 * There is no ISO standard for this. The de-facto specification is ZXing's
 * "WIFI:" URI, implemented by Android since 10 and by iOS since 11, and the
 * escaping rule is where almost every generator breaks: the characters
 * \ ; , : and " are special and must each be escaped with a backslash. A
 * password of `p;a\ss` written literally ends the field early and produces a
 * code that either fails or, worse, silently joins with the wrong password.
 *
 * Reference: github.com/zxing/zxing/wiki/Barcode-Contents
 */

/** Characters that terminate or confuse a field, and so must be escaped. */
const SPECIAL = /([\\;,:"])/g;

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeWifi(value) {
  return String(value).replace(SPECIAL, '\\$1');
}

/**
 * A value made only of hexadecimal digits is ambiguous: some clients read it as
 * raw hex bytes rather than as text. Wrapping it in double quotes forces the
 * literal reading, which is what the specification says to do.
 *
 * Order matters. The test on whether the value is hex looks at the original,
 * and the quotes go on after escaping, because escaping a quote this function
 * added would turn it into a literal backslash-quote in the value and defeat
 * the whole point.
 *
 * Note that an ordinary-looking name can be all hex: "Cafe123" is made
 * entirely of hex digits, so it is quoted too. That is correct rather than
 * over-eager, since a client reading it as hex would produce a different SSID.
 *
 * @param {string} value the original, unescaped value
 * @param {string} escaped the same value after escapeWifi
 */
function quoteIfHex(value, escaped) {
  return value.length > 0 && /^[0-9a-fA-F]+$/.test(value) ? `"${escaped}"` : escaped;
}

/** @type {{value: string, label: string, note: string}[]} */
export const WIFI_AUTH = [
  { value: 'WPA', label: 'WPA / WPA2 / WPA3', note: 'The right choice for almost every modern network, including WPA3. See the note below.' },
  { value: 'WEP', label: 'WEP', note: 'Obsolete and insecure. Only for very old equipment.' },
  { value: 'nopass', label: 'Open, no password', note: 'An open network. Anyone in range can join.' },
];

/**
 * A genuine specification disagreement, surfaced rather than papered over.
 *
 * The build brief asked for a WPA3 option. ZXing's format defines T as one of
 * WPA, WEP, nopass, and (later) WPA2-EAP. It has no WPA3 value. Android's
 * own parser maps WPA to WPA/WPA2/WPA3-transitional and does not recognise a
 * literal "WPA3", and an unrecognised value is treated as no encryption on
 * some builds, which produces a code that fails to join. So offering a WPA3
 * button that writes T:WPA3 would produce worse codes than offering WPA.
 */
export const WPA3_NOTE =
  'WPA3 networks use the same WPA setting. The Wi-Fi QR format has no separate WPA3 value: Android and iOS both read WPA as "WPA, WPA2 or WPA3", and writing a literal WPA3 makes some phones treat the network as having no password at all.';

/**
 * @typedef {object} WifiInput
 * @property {string} ssid
 * @property {string} [password]
 * @property {'WPA'|'WEP'|'nopass'} [auth]
 * @property {boolean} [hidden]
 */

/**
 * @param {WifiInput} input
 * @returns {string}
 */
export function buildWifi(input) {
  const auth = input.auth ?? 'WPA';
  const ssid = input.ssid ?? '';
  const password = auth === 'nopass' ? '' : (input.password ?? '');

  let out = `WIFI:T:${auth};S:${quoteIfHex(ssid, escapeWifi(ssid))};`;
  if (auth !== 'nopass') out += `P:${quoteIfHex(password, escapeWifi(password))};`;
  if (input.hidden) out += 'H:true;';
  return `${out};`;
}

/**
 * @param {WifiInput} input
 * @returns {{field: string, level: 'error'|'warning', message: string}[]}
 */
export function validateWifi(input) {
  const out = [];
  const auth = input.auth ?? 'WPA';

  if (!input.ssid) {
    out.push({ field: 'ssid', level: 'error', message: 'Enter the network name. This is the name that appears in the Wi-Fi list, and it is case sensitive.' });
  } else if (new TextEncoder().encode(input.ssid).length > 32) {
    out.push({ field: 'ssid', level: 'error', message: 'A network name can be at most 32 bytes. Accented characters count as two.' });
  }

  if (auth !== 'nopass') {
    if (!input.password) {
      out.push({ field: 'password', level: 'error', message: 'Enter the password, or switch the network to open if it does not have one.' });
    } else if (auth === 'WPA' && input.password.length < 8) {
      out.push({ field: 'password', level: 'warning', message: 'WPA passwords are at least 8 characters. A shorter one will not connect.' });
    } else if (auth === 'WEP' && ![5, 10, 13, 26].includes(input.password.length)) {
      out.push({ field: 'password', level: 'warning', message: 'A WEP key is normally 5, 10, 13 or 26 characters.' });
    }
  }

  if (input.hidden) {
    out.push({
      field: 'hidden',
      level: 'warning',
      message: 'Hidden networks are less reliable to join from a QR code. Some Android versions ignore the hidden flag and fail to connect.',
    });
  }

  return out;
}

export const WIFI_EXAMPLE = { ssid: 'Cafeaua Bună', password: 'Latte;2024\\Vanilla', auth: 'WPA', hidden: false };

export const WIFI_SUPPORT =
  'Built into the camera app on iOS 11 and later and Android 10 and later: point and a join prompt appears. On older Android a scanner app can read it but usually cannot join for you, and the person has to type the password. Windows and macOS camera apps do not join Wi-Fi from a code.';
