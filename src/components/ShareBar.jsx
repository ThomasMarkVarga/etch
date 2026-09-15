import { useState } from 'react';
import Icon from './Icon.jsx';
import { payloadType } from '../payloads/index.js';

/**
 * Sharing a link that rebuilds the same code, and refusing to when that would
 * put a password in someone's browser history.
 */

export default function ShareBar({ urlState, typeId, hasCode }) {
  const [copied, setCopied] = useState(false);
  const type = payloadType(typeId);
  const sensitive = type.sensitive;

  if (!hasCode) return null;

  const copy = async () => {
    if (!urlState.shareUrl) return;
    try {
      await navigator.clipboard.writeText(urlState.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused. The address bar already holds the
      // same link, so there is a working manual route.
      setCopied(false);
    }
  };

  return (
    <div className="stack-sm">
      {sensitive ? (
        <>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <button type="button" className="btn btn-sm" disabled aria-describedby="share-why">
              <Icon name="link" size={14} />
              Copy link
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => urlState.exportSettings(urlState.latest.current ?? {})}
            >
              <Icon name="download" size={14} />
              Save settings file instead
            </button>
          </div>
          <p className="hint" id="share-why">
            Link sharing is switched off for {type.label.toLowerCase()} codes, because a link holds the contents and
            links end up in chat logs, browser history and screenshots. The settings file saves to your own device
            instead, and reopens here to rebuild the same code.
          </p>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <button type="button" className="btn btn-sm" onClick={copy}>
              <Icon name={copied ? 'clipboard-check' : 'link'} size={14} />
              {copied ? 'Link copied' : 'Copy link to this code'}
            </button>
          </div>
          <p className="hint">
            The link holds everything: the text, the colours, the size. Open it on another machine and you get exactly
            this code back. It is a plain link to this page, not a redirect, and the code itself never points here.
          </p>
        </>
      )}
    </div>
  );
}
