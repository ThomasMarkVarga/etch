import { useCallback, useEffect, useState } from 'react';

/**
 * Light and dark, following the system unless the person has chosen.
 *
 * Stored in localStorage rather than a cookie: a cookie would be sent to the
 * server on every request, and this app has no server and makes no requests.
 * The choice never leaves the device.
 */

const KEY = 'etch-theme';

function systemTheme() {
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // Private windows and blocked site data both throw here. Following the
    // system preference is a perfectly good fallback.
    return null;
  }
}

export function useTheme() {
  const [choice, setChoice] = useState(() => stored());
  const [system, setSystem] = useState(() => systemTheme());

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = choice ?? system;

  useEffect(() => {
    const root = document.documentElement;
    if (choice) root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
  }, [choice]);

  const setTheme = useCallback((next) => {
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The theme still applies for this visit; it just will not be remembered.
    }
  }, []);

  return { theme, setTheme, isExplicit: choice !== null };
}
