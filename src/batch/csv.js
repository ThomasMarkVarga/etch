/**
 * CSV parsing.
 *
 * A real parser rather than split(','), because the data people paste in has
 * commas inside quoted fields, quoted quotes, and whatever line endings their
 * spreadsheet felt like. Getting this wrong means a batch of 500 labels where
 * a handful silently hold the wrong text, which is exactly the failure this
 * app exists to prevent.
 *
 * Follows RFC 4180, plus the two things spreadsheets actually do: semicolon
 * delimiters (the default in much of Europe) and a UTF-8 byte order mark.
 */

/**
 * @param {string} text
 * @returns {','|';'|'\t'}
 */
export function sniffDelimiter(text) {
  const firstLine = text.slice(0, 5000).split(/\r?\n/)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const best = /** @type {(','|';'|'\t')[]} */ (Object.keys(counts)).sort((a, b) => counts[b] - counts[a])[0];
  return counts[best] > 0 ? best : ',';
}

/**
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {string[][]}
 */
export function parseCsv(text, delimiter) {
  const input = text.replace(/^﻿/, '');
  const d = delimiter ?? sniffDelimiter(input);

  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // A trailing newline should not produce a phantom empty row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === d) {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Split parsed rows into a header and body, deciding whether the first row is
 * a header by whether it looks like labels rather than data.
 *
 * @param {string[][]} rows
 * @returns {{headers: string[], body: string[][], hadHeader: boolean}}
 */
export function splitHeader(rows) {
  if (rows.length === 0) return { headers: [], body: [], hadHeader: false };
  const first = rows[0];

  // A header row is short text in every cell, with nothing that looks like a
  // URL or a number. If the file has only one row, treat it as data.
  const looksLikeHeader =
    rows.length > 1 &&
    first.every((c) => {
      const v = c.trim();
      return v.length > 0 && v.length < 40 && !/^https?:\/\//i.test(v) && !/^\d+([.,]\d+)?$/.test(v);
    });

  if (looksLikeHeader) return { headers: first.map((h) => h.trim()), body: rows.slice(1), hadHeader: true };
  return {
    headers: first.map((_, i) => `Column ${i + 1}`),
    body: rows,
    hadHeader: false,
  };
}

/**
 * Make a filename safe for a ZIP entry on every operating system, and unique
 * within the archive.
 *
 * @param {string} raw
 * @param {number} index
 * @param {Set<string>} taken
 * @returns {string}
 */
export function safeFilename(raw, index, taken) {
  let base = String(raw ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .replace(/-+/g, '-')
    .slice(0, 80);

  if (!base) base = `code-${String(index + 1).padStart(4, '0')}`;

  // Windows refuses these names regardless of extension.
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `_${base}`;

  let name = base;
  let n = 2;
  while (taken.has(name.toLowerCase())) {
    name = `${base}-${n}`;
    n += 1;
  }
  taken.add(name.toLowerCase());
  return name;
}
