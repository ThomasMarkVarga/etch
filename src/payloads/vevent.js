/**
 * Calendar event, iCalendar VEVENT (RFC 5545).
 *
 * The fiddly parts are time zones and escaping.
 *
 * Time: a value written as 20260304T190000 with no suffix is "floating" local
 * time, which is what you want for a poster on a wall, because 7pm means 7pm
 * wherever the reader is. A value ending in Z is UTC, which is what you want
 * for an online event that happens at one absolute moment. Both are offered,
 * because picking silently is how a printed poster ends up two hours out.
 *
 * Escaping (RFC 5545 section 3.3.11): backslash, semicolon and comma are
 * escaped, and newlines become \n. Unescaped commas in a location are a common
 * bug, because comma is the list separator, so "Strada Mare 12, Cluj" can be
 * read as two separate locations.
 */

/** @param {string} value */
export function escapeIcal(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Format a datetime-local value (YYYY-MM-DDTHH:mm) for iCalendar.
 * @param {string} value
 * @param {boolean} utc
 * @returns {string|null}
 */
export function formatIcalDate(value, utc) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  if (hh === undefined) return `${y}${mo}${d}`;
  if (!utc) return `${y}${mo}${d}T${hh}${mm}00`;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}00Z`
  );
}

/**
 * @typedef {object} EventInput
 * @property {string} [summary]
 * @property {string} [location]
 * @property {string} [description]
 * @property {string} [start] YYYY-MM-DDTHH:mm, or YYYY-MM-DD for all day.
 * @property {string} [end]
 * @property {boolean} [allDay]
 * @property {boolean} [utc]
 * @property {string} [url]
 */

/**
 * @param {EventInput} input
 * @returns {string}
 */
export function buildVEvent(input) {
  const e = escapeIcal;
  const allDay = !!input.allDay;
  const utc = !allDay && !!input.utc;

  const start = formatIcalDate(allDay ? (input.start ?? '').slice(0, 10) : input.start ?? '', utc);
  const end = formatIcalDate(allDay ? (input.end ?? '').slice(0, 10) : input.end ?? '', utc);

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Etch//Static QR//EN', 'BEGIN:VEVENT'];

  if (input.summary) lines.push(`SUMMARY:${e(input.summary)}`);
  if (start) lines.push(allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`);
  if (end) lines.push(allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`);
  if (input.location) lines.push(`LOCATION:${e(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${e(input.description)}`);
  if (input.url) lines.push(`URL:${e(input.url)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** @param {EventInput} input */
export function validateEvent(input) {
  const out = [];
  if (!input.summary) {
    out.push({ field: 'summary', level: 'error', message: 'Give the event a name, or the calendar entry will be blank.' });
  }
  if (!input.start) {
    out.push({ field: 'start', level: 'error', message: 'Choose when the event starts.' });
  }
  if (input.start && input.end && input.end < input.start) {
    out.push({ field: 'end', level: 'error', message: 'The end is before the start.' });
  }
  if (input.start && !input.end) {
    out.push({
      field: 'end',
      level: 'warning',
      message: 'Without an end time, calendar apps guess: some make it an hour, some make it all day.',
    });
  }
  if (input.utc && !input.allDay) {
    out.push({
      field: 'utc',
      level: 'warning',
      message: 'Fixed to one worldwide moment. Good for an online event, wrong for a poster: someone in another country will see a different clock time than the one printed next to the code.',
    });
  }
  return out;
}

export const VEVENT_EXAMPLE = {
  summary: 'Târg de Crăciun',
  location: 'Piața Unirii, Cluj-Napoca',
  start: '2026-12-04T17:00',
  end: '2026-12-04T22:00',
  allDay: false,
  utc: false,
};

export const VEVENT_SUPPORT =
  'iOS recognises a VEVENT from the camera and offers to add it to Calendar. Android is less consistent: Google Lens and most scanner apps handle it, but the stock camera on some builds shows the raw text instead. Printing the date next to the code costs nothing and covers that case.';
