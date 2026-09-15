import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Notice from './Notice.jsx';

/**
 * The trust panel.
 *
 * Distinct from the scan verification beside the code. That one answers "will
 * this code work". This one answers "is this app doing what it says", and it
 * answers it with a live measurement rather than a promise, because a promise
 * is exactly what every other free QR site also makes.
 */

/** Requests that are part of loading the page itself, not runtime traffic. */
function isSameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function useNetworkCount() {
  const [counts, setCounts] = useState({ external: 0, sameOrigin: 0, ready: false });

  useEffect(() => {
    if (typeof PerformanceObserver !== 'function') {
      setCounts((c) => ({ ...c, ready: false }));
      return undefined;
    }

    const tally = (entries) => {
      let external = 0;
      let sameOrigin = 0;
      for (const e of entries) {
        if (e.entryType !== 'resource') continue;
        if (isSameOrigin(e.name)) sameOrigin += 1;
        else external += 1;
      }
      if (external || sameOrigin) {
        setCounts((c) => ({ external: c.external + external, sameOrigin: c.sameOrigin + sameOrigin, ready: true }));
      }
    };

    // Everything already loaded, plus everything from here on.
    try {
      tally(performance.getEntriesByType('resource'));
    } catch {
      /* not fatal */
    }
    setCounts((c) => ({ ...c, ready: true }));

    const observer = new PerformanceObserver((list) => tally(list.getEntries()));
    observer.observe({ type: 'resource', buffered: false });
    return () => observer.disconnect();
  }, []);

  return counts;
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function TrustPanel() {
  const { external, sameOrigin, ready } = useNetworkCount();
  const online = useOnline();

  return (
    <section className="card" style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-trust" id="how-it-works">
      <div className="card-head">
        <h2 id="h-trust" className="card-title">
          <Icon name="shield-check" size={16} style={{ marginRight: 6, color: 'var(--accent)' }} />
          Checking this app, rather than trusting it
        </h2>
      </div>

      <div className="card-pad stack">
        <div className="grid-2">
          <div className="card card-pad" style={{ background: 'var(--raised)', boxShadow: 'none' }}>
            <p className="hint">Requests to anywhere but this site</p>
            <p
              className="stat"
              style={{
                fontSize: 'var(--fs-32)',
                fontWeight: 600,
                color: external === 0 ? 'var(--ok)' : 'var(--danger)',
                lineHeight: 1.2,
              }}
              aria-live="polite"
            >
              {ready ? external : '...'}
            </p>
            <p className="hint">
              Counted live with PerformanceObserver. {sameOrigin} same-origin requests loaded the app itself. After
              that, nothing.
            </p>
          </div>

          <div className="card card-pad" style={{ background: 'var(--raised)', boxShadow: 'none' }}>
            <p className="hint">Connection</p>
            <p
              style={{
                fontSize: 'var(--fs-21)',
                fontWeight: 600,
                lineHeight: 1.3,
                color: online ? 'var(--text)' : 'var(--ok)',
              }}
              aria-live="polite"
            >
              <Icon name={online ? 'wifi' : 'wifi-off'} size={18} style={{ marginRight: 6 }} />
              {online ? 'Online' : 'Offline, still working'}
            </p>
            <p className="hint">
              Turn off your Wi-Fi and reload. Everything keeps working.
            </p>
          </div>
        </div>

        <Notice kind="info" word="Check it yourself">
          Open developer tools, go to the Network tab, and type into the field above. Nothing appears.
        </Notice>

        <div>
          <h3 style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--s-2)' }}>How this works</h3>
          <p className="hint">
            Your data becomes the pattern right here in the page.{' '}
            <strong style={{ color: 'var(--text)' }}>The code contains no reference to this website at all,</strong> so
            it keeps working even with this site deleted.
          </p>
        </div>

        <details className="disclosure">
          <summary>
            What this app cannot promise
            <Icon name="chevron-right" size={14} className="chev" />
          </summary>
          <div className="disclosure-body stack-sm">
            {[
              [
                'Very long text makes a fragile code',
                'More characters means smaller squares at the same printed size. A short address on your own domain beats a paragraph.',
              ],
              [
                'Styling always costs something',
                'The scan test is a good check but it is a simulation. It cannot model your printer, your paper, or a scratched laminate.',
              ],
              [
                'Some scanners are worse than others',
                'Older scanners and in-app browsers handle Wi-Fi, calendar and payment codes badly or not at all. The note on each type says what is known.',
              ],
              [
                'Print quality beats everything in this app',
                'A perfect file printed badly fails. An ordinary file printed well does not.',
              ],
              [
                'Your code is permanent. Your domain is not.',
                'The one nobody tells you. The pattern will still be readable in thirty years, but the website it points at lasts exactly as long as someone keeps renewing the domain.',
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <p style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>{title}</p>
                <p className="hint">{body}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
