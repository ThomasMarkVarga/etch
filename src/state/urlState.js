import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_STYLE } from '../core/style.js';
import { isSensitive, payloadType } from '../payloads/index.js';

/**
 * State lives in the URL hash, with one deliberate exception.
 *
 * A link that reproduces a code exactly is genuinely useful: send it to a
 * colleague, bookmark it, come back in a year and regenerate the same artwork.
 *
 * But links end up in chat logs, browser history, screenshots, and the address
 * bar of a shared screen. A Wi-Fi password, a home address or a bank account
 * does not belong in any of those. For those payload types the hash carries
 * the settings and not the payload, the copy-link control is disabled with a
 * sentence explaining why, and a downloaded settings file is offered instead.
 *
 * Silence would be worse than either choice. Someone who sees a link and
 * assumes it is private is worse off than someone who is told it is not.
 */

const VERSION = 1;

export const DEFAULT_ENCODING = {
  ecc: 'M',
  minVersion: 1,
  mask: -1,
  boostEcc: true,
  declareUtf8: false,
};

export const DEFAULT_PRINT = {
  // 35mm rather than 30mm so the starting width already satisfies the starting
  // scan distance. Defaults that warn about themselves on first load teach
  // people to scroll past the warnings.
  widthMm: 35,
  distanceMm: 300,
  methodId: 'laser',
  units: 'mm',
};

const DEFAULT_INPUTS = { url: { url: '' } };

/** Compact keys, because they end up in a URL people may have to read out. */
function encodeState({ typeId, input, encoding, style, print }) {
  const payload = {
    v: VERSION,
    t: typeId,
    e: diff(encoding, DEFAULT_ENCODING),
    s: diff(style, DEFAULT_STYLE),
    p: diff(print, DEFAULT_PRINT),
  };
  if (!isSensitive(typeId)) payload.i = input;
  return payload;
}

/** Only the settings that differ from the default, so links stay short. */
function diff(value, defaults) {
  const out = {};
  for (const [k, v] of Object.entries(value ?? {})) {
    if (JSON.stringify(v) !== JSON.stringify(defaults[k])) out[k] = v;
  }
  return out;
}

/**
 * Base64url so the hash survives being pasted into chat apps that mangle
 * percent-encoding, and TextEncoder so accented characters survive at all.
 */
function toHash(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromHash(hash) {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && parsed.v === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function readInitial() {
  const fallback = {
    typeId: 'url',
    inputs: DEFAULT_INPUTS,
    encoding: { ...DEFAULT_ENCODING },
    style: { ...DEFAULT_STYLE },
    print: { ...DEFAULT_PRINT },
  };

  if (typeof location === 'undefined') return fallback;
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return fallback;

  const parsed = fromHash(raw);
  if (!parsed) return fallback;

  const typeId = typeof parsed.t === 'string' ? parsed.t : 'url';
  return {
    typeId: payloadType(typeId).id,
    inputs: { ...DEFAULT_INPUTS, ...(parsed.i ? { [typeId]: parsed.i } : {}) },
    encoding: { ...DEFAULT_ENCODING, ...(parsed.e ?? {}) },
    style: { ...DEFAULT_STYLE, ...(parsed.s ?? {}) },
    print: { ...DEFAULT_PRINT, ...(parsed.p ?? {}) },
  };
}

/**
 * @typedef {object} UrlState
 * @property {object} initial
 * @property {(state: object) => void} sync
 * @property {boolean} sensitive
 * @property {string|null} shareUrl
 * @property {(state: object) => void} commit
 * @property {(state: object) => void} exportSettings
 */

export function useUrlState() {
  const initial = useMemo(readInitial, []);
  const [sensitive, setSensitive] = useState(() => isSensitive(initial.typeId));
  const [shareUrl, setShareUrl] = useState(null);
  const lastHash = useRef('');
  const timer = useRef(null);
  const latest = useRef(null);

  // replaceState while typing keeps the back button usable: without it every
  // keystroke would add a history entry and Back would step letter by letter.
  const sync = useCallback((state) => {
    latest.current = state;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const isPrivate = isSensitive(state.typeId);
      setSensitive(isPrivate);

      const hash = toHash(encodeState(state));
      if (hash === lastHash.current) return;
      lastHash.current = hash;

      const url = `${location.pathname}#${hash}`;
      history.replaceState(null, '', url);
      setShareUrl(isPrivate ? null : `${location.origin}${url}`);
    }, 250);
  }, []);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  /** A committed change, such as switching payload type, gets a history entry. */
  const commit = useCallback((state) => {
    const hash = toHash(encodeState(state));
    lastHash.current = hash;
    history.pushState(null, '', `${location.pathname}#${hash}`);
  }, []);

  /**
   * The offer for sensitive payloads: a file, saved locally, that reproduces
   * the code later without ever having been a link.
   */
  const exportSettings = useCallback((state) => {
    const full = { ...encodeState(state), i: state.input, note: 'Etch settings file. Open etch.vibe-coding.fans and load this to rebuild the same code.' };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etch-${state.typeId}-settings.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, []);

  // Memoised: App holds this in an effect dependency list, and a fresh object
  // on every render would re-arm the debounce on every keystroke of any field.
  return useMemo(
    () => ({ initial, sync, commit, sensitive, shareUrl, exportSettings, latest }),
    [initial, sync, commit, sensitive, shareUrl, exportSettings],
  );
}

/** Parse a settings file back into app state. */
export function parseSettingsFile(text) {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.v !== VERSION) throw new Error('That is not an Etch settings file, or it was made by a much older version.');
  return {
    typeId: payloadType(parsed.t).id,
    input: parsed.i ?? {},
    encoding: { ...DEFAULT_ENCODING, ...(parsed.e ?? {}) },
    style: { ...DEFAULT_STYLE, ...(parsed.s ?? {}) },
    print: { ...DEFAULT_PRINT, ...(parsed.p ?? {}) },
  };
}
