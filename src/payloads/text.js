/**
 * Plain text. No format, no prefix, no interpretation.
 *
 * Worth having as its own type because a scanner that sees text simply shows
 * it, which is the right thing for a note, a serial number, or an instruction
 * on a piece of equipment.
 */

/** @param {{text: string}} input @returns {string} */
export function buildText(input) {
  return input.text ?? '';
}

/** @param {{text: string}} input */
export function validateText(input) {
  const out = [];
  if (!input.text || !input.text.trim()) {
    out.push({ field: 'text', level: 'error', message: 'Type something to put in the code.' });
  }
  if (input.text && input.text.length > 500) {
    out.push({
      field: 'text',
      level: 'warning',
      message: 'Long text makes a dense code with very small squares. Print it large, or put the text on a page and encode the address instead.',
    });
  }
  return out;
}

export const TEXT_EXAMPLE = { text: 'Filter changed 4 March 2026. Next service due at 12,000 hours.' };

export const TEXT_SUPPORT =
  'Read by every scanner there is. Phone cameras show the text and offer to search or copy it; they will not open anything, which is exactly what you want on a label.';
