/**
 * Email, as a mailto: URI (RFC 6068).
 *
 * Subject and body are query parameters and must be percent-encoded.
 * encodeURIComponent is almost right, but it leaves ! ' ( ) * alone, and
 * RFC 3986 lists those as reserved sub-delimiters, so they are encoded here
 * too. Leaving them raw is how a subject line with an apostrophe ends up
 * truncated in some mail clients.
 */

/** @param {string} s */
export function encodeComponent(s) {
  return encodeURIComponent(String(s ?? '')).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * @param {{to: string, subject?: string, body?: string, cc?: string, bcc?: string}} input
 * @returns {string}
 */
export function buildEmail(input) {
  const to = String(input.to ?? '').trim();
  const params = [];
  if (input.cc) params.push(`cc=${encodeComponent(input.cc.trim())}`);
  if (input.bcc) params.push(`bcc=${encodeComponent(input.bcc.trim())}`);
  if (input.subject) params.push(`subject=${encodeComponent(input.subject)}`);
  if (input.body) params.push(`body=${encodeComponent(input.body)}`);

  // The local part can legally contain characters that are not legal in a URI,
  // so both halves are encoded while the @ stays readable.
  const at = to.lastIndexOf('@');
  const safeTo =
    at > 0
      ? `${encodeComponent(to.slice(0, at))}@${encodeComponent(to.slice(at + 1))}`
      : encodeComponent(to);

  return `mailto:${safeTo}${params.length ? `?${params.join('&')}` : ''}`;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** @param {{to: string, subject?: string, body?: string}} input */
export function validateEmail(input) {
  const out = [];
  const to = String(input.to ?? '').trim();
  if (!to) {
    out.push({ field: 'to', level: 'error', message: 'Enter the address the message should go to.' });
  } else if (!EMAIL_SHAPE.test(to)) {
    out.push({ field: 'to', level: 'error', message: 'That does not look like an email address. It should look like name@example.com.' });
  }
  if (input.body && input.body.length > 300) {
    out.push({
      field: 'body',
      level: 'warning',
      message: 'A long pre-filled message makes a dense code, and most people rewrite it anyway. A short prompt usually works better.',
    });
  }
  return out;
}

export const EMAIL_EXAMPLE = { to: 'hello@example.com', subject: 'Table booking', body: '' };

export const EMAIL_SUPPORT =
  'Widely supported. Phone cameras open the mail app with the fields filled in. Pre-filled body text is respected by Apple Mail, Gmail and Outlook, though a few third-party clients drop it.';
