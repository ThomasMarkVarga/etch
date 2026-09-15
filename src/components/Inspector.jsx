import { useCallback, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Notice from './Notice.jsx';
import { decodeImageFile } from '../inspector/decodeImage.js';
import { matchRedirectHost, describeHost, longevityNote } from '../inspector/redirectHosts.js';

/**
 * The inspector.
 *
 * Drop in a code from anywhere and see what is actually inside it. This is the
 * feature that makes the argument concrete: someone who was given a QR code by
 * an agency, or generated one on a free site years ago, can find out here that
 * it does not contain their address at all.
 *
 * The tone matters. Being right about this is not a licence to sneer at people
 * for a decision they made without the information.
 */

/** Work out what a decoded string actually is. */
function describePayload(text) {
  const t = text.trim();

  if (/^WIFI:/i.test(t)) {
    const ssid = /S:((?:\\.|[^;])*)/i.exec(t)?.[1]?.replace(/\\(.)/g, '$1');
    const hasPassword = /(?:^|;)P:(?:\\.|[^;])+/i.test(t);
    return {
      kind: 'Wi-Fi network',
      icon: 'wifi',
      detail: `Joins the network ${ssid ? `"${ssid}"` : ''}${hasPassword ? ', password included in the code' : ''}. Anyone who can photograph this code has the password.`,
    };
  }
  if (/^BEGIN:VCARD/i.test(t)) return { kind: 'Contact card (vCard)', icon: 'person-vcard', detail: 'Saves a contact to the phone.' };
  if (/^MECARD:/i.test(t)) return { kind: 'Contact card (meCard)', icon: 'person-vcard', detail: 'Saves a contact to the phone.' };
  if (/^BEGIN:VCALENDAR/i.test(t)) return { kind: 'Calendar event', icon: 'calendar-event', detail: 'Adds an event to the calendar.' };
  if (/^BCD\n/.test(t)) {
    const lines = t.split('\n');
    return {
      kind: 'SEPA bank transfer',
      icon: 'bank',
      detail: `Fills in a transfer to ${lines[5] || 'an account'}${lines[7] ? ` for ${lines[7].replace('EUR', '')} euro` : ''}. Nothing is paid by scanning it.`,
    };
  }
  if (/^mailto:/i.test(t)) return { kind: 'Email', icon: 'envelope', detail: 'Opens a new email.' };
  if (/^(sms|smsto):/i.test(t)) return { kind: 'Text message', icon: 'chat-dots', detail: 'Opens a text message.' };
  if (/^tel:/i.test(t)) return { kind: 'Phone number', icon: 'telephone', detail: 'Offers to call a number.' };
  if (/^geo:/i.test(t)) return { kind: 'Map location', icon: 'geo-alt', detail: 'A point on the map.' };
  if (/^https?:\/\//i.test(t)) return { kind: 'Web address', icon: 'link-45deg', detail: 'Opens a website.' };
  return { kind: 'Plain text', icon: 'card-text', detail: 'Shows text. Opens nothing.' };
}

export default function Inspector() {
  const [text, setText] = useState('');
  const [decoded, setDecoded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDecoded(null);
    const outcome = await decodeImageFile(file);
    if (outcome.ok && outcome.text) {
      setDecoded({ text: outcome.text, how: outcome.how });
      setText(outcome.text);
    } else {
      setError(outcome.reason);
    }
    setBusy(false);
  }, []);

  const analysed = decoded?.text ?? (text.trim() ? text.trim() : null);
  const info = analysed ? describePayload(analysed) : null;

  let host = null;
  let redirect = null;
  if (analysed && /^https?:\/\//i.test(analysed.trim())) {
    try {
      host = new URL(analysed.trim()).hostname;
      redirect = matchRedirectHost(host);
    } catch {
      host = null;
    }
  }

  return (
    <section className="card" aria-labelledby="h-inspect">
      <div className="card-head">
        <h2 id="h-inspect" className="card-title">
          What is actually in this code?
        </h2>
      </div>

      <div className="card-pad stack">
        <p className="hint">
          Drop in a photo or screenshot of any QR code, or paste what a scanner told you it says. This shows what it
          really contains, which is not always what the person who ordered it thinks.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          style={{
            display: 'grid',
            placeItems: 'center',
            gap: 'var(--s-3)',
            padding: 'var(--s-6) var(--s-4)',
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--r-lg)',
            background: dragging ? 'var(--accent-soft)' : 'var(--raised)',
            textAlign: 'center',
          }}
        >
          <Icon name="upload" size={26} style={{ color: 'var(--muted)' }} />
          <p style={{ fontSize: 'var(--fs-14)' }}>Drop an image of a QR code here</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            id="inspect-file"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="search" size={14} />}
            {busy ? 'Reading' : 'Choose an image'}
          </button>
          <p className="hint">Read in your browser. The image is not uploaded anywhere.</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="inspect-text">
            Or paste what the code says
          </label>
          <textarea
            id="inspect-text"
            className="textarea input-mono"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDecoded(null);
              setError(null);
            }}
            placeholder="https://qrco.de/bfXamp"
            spellCheck="false"
          />
        </div>

        {error && <Notice kind="danger">{error}</Notice>}

        {decoded && (
          <Notice kind="ok" word="Code read">
            Decoded {decoded.how}.
          </Notice>
        )}

        {analysed && info && (
          <div className="stack-sm">
            <div className="card card-pad" style={{ background: 'var(--raised)', boxShadow: 'none' }}>
              <p className="row" style={{ gap: 'var(--s-2)', fontWeight: 600 }}>
                <Icon name={info.icon} size={18} style={{ color: 'var(--accent)' }} />
                {info.kind}
              </p>
              <p className="hint" style={{ marginTop: 'var(--s-2)' }}>
                {info.detail}
              </p>
              <p
                className="wrap-anywhere"
                style={{
                  marginTop: 'var(--s-3)',
                  padding: 'var(--s-3)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-13)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {analysed.slice(0, 1200)}
                {analysed.length > 1200 ? '…' : ''}
              </p>
              <p className="hint" style={{ marginTop: 'var(--s-2)' }}>
                {new TextEncoder().encode(analysed).length} bytes.
              </p>
            </div>

            {redirect ? (
              <>
                <Notice kind="warn" word="This code does not hold your address">
                  {describeHost(redirect)} Scanning it goes to {redirect.host} first, and that service then forwards
                  the reader to wherever the destination is currently set.
                </Notice>
                <div className="notice notice-info">
                  <Icon name="info-circle-fill" size={18} className="notice-icon" />
                  <p>
                    <span className="notice-label">What that means. </span>
                    {longevityNote(redirect)}
                  </p>
                </div>
              </>
            ) : host ? (
              <Notice kind="ok" word="Points straight at a domain">
                This code holds <strong>{host}</strong> directly, with no redirect service in between. It will keep
                working for as long as that domain does, with nobody in the middle who can switch it off.
              </Notice>
            ) : (
              <Notice kind="ok" word="No redirect">
                There is no web address in this code, so there is nothing that can be redirected. Whatever a scanner
                shows is what is stored in the pattern.
              </Notice>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
