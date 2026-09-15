/**
 * The payload registry.
 *
 * One entry per type, each pairing a form shape with a builder and a validator.
 * The interface reads this rather than hard-coding a list, so adding a type
 * never means touching the UI.
 *
 * `sensitive: true` marks types that must never be written into a shareable
 * URL. A link to a generated code ends up in chat logs, browser history and
 * screenshots, and a Wi-Fi password or a home address does not belong in any of
 * those. See state/urlState.js.
 */

import { buildUrl, validateUrl, URL_EXAMPLE, URL_SUPPORT } from './url.js';
import { buildText, validateText, TEXT_EXAMPLE, TEXT_SUPPORT } from './text.js';
import { buildWifi, validateWifi, WIFI_EXAMPLE, WIFI_SUPPORT } from './wifi.js';
import { buildVCard, validateContact, VCARD_EXAMPLE, VCARD_SUPPORT } from './vcard.js';
import { buildMeCard, MECARD_SUPPORT } from './mecard.js';
import { buildEmail, validateEmail, EMAIL_EXAMPLE, EMAIL_SUPPORT } from './email.js';
import { buildSms, validateSms, SMS_EXAMPLE, SMS_SUPPORT } from './sms.js';
import { buildTel, validateTel, TEL_EXAMPLE, TEL_SUPPORT } from './tel.js';
import { buildGeo, validateGeo, GEO_EXAMPLE, GEO_SUPPORT } from './geo.js';
import { buildVEvent, validateEvent, VEVENT_EXAMPLE, VEVENT_SUPPORT } from './vevent.js';
import { buildSepa, validateSepa, SEPA_EXAMPLE, SEPA_SUPPORT, SEPA_RECOMMENDED_ECC } from './sepa.js';
import { buildAppStore, validateAppStore, APPSTORE_EXAMPLE, APPSTORE_SUPPORT, APPSTORE_NOTE } from './appstore.js';

/**
 * @typedef {object} PayloadType
 * @property {string} id
 * @property {string} label
 * @property {string} icon Bootstrap Icons name.
 * @property {string} blurb One line, shown under the type selector.
 * @property {(input: any) => string} build
 * @property {(input: any) => {field: string, level: 'error'|'warning', message: string}[]} validate
 * @property {object} example
 * @property {string} support How real scanners handle it.
 * @property {string} hue Decorative colour class, from the six in tokens.css.
 * @property {boolean} sensitive Keep out of shareable URLs.
 * @property {string} [note] A longer honest caveat.
 * @property {string} [recommendedEcc]
 */

/** @type {PayloadType[]} */
export const PAYLOAD_TYPES = [
  {
    id: 'url',
    hue: 'indigo',
    label: 'Website',
    icon: 'link-45deg',
    blurb: 'Opens a web address.',
    build: buildUrl,
    validate: validateUrl,
    example: URL_EXAMPLE,
    support: URL_SUPPORT,
    sensitive: false,
  },
  {
    id: 'text',
    hue: 'sky',
    label: 'Text',
    icon: 'card-text',
    blurb: 'Shows words. Opens nothing.',
    build: buildText,
    validate: validateText,
    example: TEXT_EXAMPLE,
    support: TEXT_SUPPORT,
    sensitive: false,
  },
  {
    id: 'wifi',
    hue: 'cyan',
    label: 'Wi-Fi',
    icon: 'wifi',
    blurb: 'Joins a network without typing the password.',
    build: buildWifi,
    validate: validateWifi,
    example: WIFI_EXAMPLE,
    support: WIFI_SUPPORT,
    sensitive: true,
  },
  {
    id: 'contact',
    hue: 'violet',
    label: 'Contact',
    icon: 'person-vcard',
    blurb: 'Saves a name and number to the phone.',
    build: (input) => (input.format === 'mecard' ? buildMeCard(input) : buildVCard(input)),
    validate: validateContact,
    example: { ...VCARD_EXAMPLE, format: 'vcard' },
    support: VCARD_SUPPORT,
    sensitive: true,
  },
  {
    id: 'email',
    hue: 'fuchsia',
    label: 'Email',
    icon: 'envelope',
    blurb: 'Opens a new message, ready to send.',
    build: buildEmail,
    validate: validateEmail,
    example: EMAIL_EXAMPLE,
    support: EMAIL_SUPPORT,
    sensitive: false,
  },
  {
    id: 'sms',
    hue: 'teal',
    label: 'Text message',
    icon: 'chat-dots',
    blurb: 'Opens a text message, ready to send.',
    build: buildSms,
    validate: validateSms,
    example: SMS_EXAMPLE,
    support: SMS_SUPPORT,
    sensitive: false,
  },
  {
    id: 'tel',
    hue: 'indigo',
    label: 'Phone',
    icon: 'telephone',
    blurb: 'Offers to call a number.',
    build: buildTel,
    validate: validateTel,
    example: TEL_EXAMPLE,
    support: TEL_SUPPORT,
    sensitive: false,
  },
  {
    id: 'geo',
    hue: 'sky',
    label: 'Location',
    icon: 'geo-alt',
    blurb: 'A point on the map, by coordinates.',
    build: buildGeo,
    validate: validateGeo,
    example: GEO_EXAMPLE,
    support: GEO_SUPPORT,
    sensitive: false,
  },
  {
    id: 'event',
    hue: 'violet',
    label: 'Event',
    icon: 'calendar-event',
    blurb: 'Adds a date to the calendar.',
    build: buildVEvent,
    validate: validateEvent,
    example: VEVENT_EXAMPLE,
    support: VEVENT_SUPPORT,
    sensitive: false,
  },
  {
    id: 'sepa',
    hue: 'teal',
    label: 'Bank transfer',
    icon: 'bank',
    blurb: 'Fills in a euro transfer in a banking app.',
    build: buildSepa,
    validate: validateSepa,
    example: SEPA_EXAMPLE,
    support: SEPA_SUPPORT,
    sensitive: true,
    recommendedEcc: SEPA_RECOMMENDED_ECC,
  },
  {
    id: 'appstore',
    hue: 'fuchsia',
    label: 'App link',
    icon: 'phone',
    blurb: 'Opens an app listing. Read the note first.',
    build: buildAppStore,
    validate: validateAppStore,
    example: APPSTORE_EXAMPLE,
    support: APPSTORE_SUPPORT,
    note: APPSTORE_NOTE,
    sensitive: false,
  },
];

/** @param {string} id @returns {PayloadType} */
export function payloadType(id) {
  return PAYLOAD_TYPES.find((t) => t.id === id) ?? PAYLOAD_TYPES[0];
}

/**
 * Build the encoded string for a type, never throwing.
 * @param {string} typeId
 * @param {object} input
 * @returns {string}
 */
export function buildPayload(typeId, input) {
  try {
    return payloadType(typeId).build(input) ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {string} typeId
 * @param {object} input
 */
export function validatePayload(typeId, input) {
  try {
    return payloadType(typeId).validate(input) ?? [];
  } catch {
    return [];
  }
}

/** @param {string} typeId */
export function isSensitive(typeId) {
  return payloadType(typeId).sensitive;
}
