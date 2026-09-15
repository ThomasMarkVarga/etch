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
              Counted live in your browser with PerformanceObserver. {sameOrigin} same-origin requests loaded the app
              itself: the page, the script, the stylesheet and two font files. After that, nothing.
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
              Turn off your Wi-Fi and reload the page. Everything keeps working, because there is nothing to fetch and
              nothing to ask permission from.
            </p>
          </div>
        </div>

        <Notice kind="info" word="Check it yourself">
          Open your browser's developer tools, go to the Network tab, and type into the field above. Nothing appears.
          The code is built from your text by JavaScript running on this page, and your text never leaves it.
        </Notice>

        <div>
          <h3 style={{ fontSize: 'var(--fs-16)', marginBottom: 'var(--s-2)' }}>How this works</h3>
          <p className="hint">
            Your data is turned into the black and white pattern right here in the page. Nothing is sent anywhere,
            nothing is stored, and no account exists to store it against. Most importantly:{' '}
            <strong style={{ color: 'var(--text)' }}>
              the code contains no reference to this website at all.
            </strong>{' '}
            Scan one of these with the site closed, with this site deleted, with the company that made it long gone,
            and it still works, because the answer is in the pattern rather than at the end of a redirect.
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
                'More characters means more squares, and at a fixed printed size every square gets smaller. A long payload can be technically valid and still scan badly. Encoding a short address on your own domain beats encoding a paragraph.',
              ],
              [
                'Styling always costs something',
                'Dots, gradients and a centre logo all reduce the margin the code has to work with. The scan test here is a genuinely good check, but it is a simulation. It cannot model your exact printer, your paper, or a scratched laminate.',
              ],
              [
                'Some scanners are worse than others',
                'Older dedicated scanners and some in-app browsers, particularly inside social media apps, handle Wi-Fi, calendar and payment codes badly or not at all. The notes on each type say what is known, and nothing here claims compatibility that has not been checked.',
              ],
              [
                'Print quality beats everything in this app',
                'Substrate, ink, contrast and the light in the room matter more than any setting on this page. A perfect file printed badly fails; an ordinary file printed well does not.',
              ],
              [
                'Your code is permanent. Your domain is not.',
                'This is the one nobody tells you. A statically encoded address will still be readable in thirty years, but it points at a website, and that website lasts exactly as long as someone keeps renewing the domain and paying for hosting. If the code is going on something permanent, the domain is the part to worry about, not the pattern.',
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
