import Icon from './Icon.jsx';
import Notice from './Notice.jsx';
import { ECC_COPY, ECC_LETTERS } from '../core/encode.js';

/**
 * The encoder's decisions, exposed.
 *
 * Progressive disclosure: this whole panel is collapsed by default, because
 * the simple path is type a URL and download an SVG. Someone who opens it gets
 * the real trade-off in plain words, never a bare letter or version number.
 */

export default function EncodingControls({ etch, encoding, setEncoding, onApplyShrink }) {
  const { result, headroom, shrinks, naturalVersion } = etch;
  const set = (patch) => setEncoding((e) => ({ ...e, ...patch }));

  const nearVersionBump = headroom && headroom.charsLeft <= 8 && result && result.version < 40;

  return (
    <section className="stack-sm">
      {result && (
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <dl className="kv" style={{ flex: '1 1 16rem' }}>
              <dt>Grid</dt>
              <dd>
                {result.size} × {result.size} squares
              </dd>
              <dt>Size step</dt>
              <dd>
                Version {result.version} of 40
                {naturalVersion && naturalVersion < result.version ? ` (your floor, not your text)` : ''}
              </dd>
              <dt>Damage it survives</dt>
              <dd>
                {ECC_COPY[result.ecc].label}, {ECC_COPY[result.ecc].short}
              </dd>
              <dt>Space left</dt>
              <dd>
                {result.remainingBits} bits, about {headroom?.charsLeft ?? 0} more characters
              </dd>
            </dl>
          </div>

          {nearVersionBump && (
            <div style={{ marginTop: 'var(--s-3)' }}>
              <Notice kind="warn" word="Nearly full" live>
                About {headroom.charsLeft} more characters and this code steps up to version {result.version + 1}. That
                adds four squares along each edge, so at the same printed width every square gets smaller and harder to
                scan.
              </Notice>
            </div>
          )}

          {result.eccWasBoosted && (
            <p className="hint" style={{ marginTop: 'var(--s-3)' }}>
              <Icon name="info-circle-fill" size={13} /> Your text left spare room, so the damage tolerance was raised
              from {ECC_COPY[result.requestedEcc].label} to {ECC_COPY[result.ecc].label} for free. The code is no bigger
              than it would have been.
            </p>
          )}

          {shrinks.length > 0 && (
            <div style={{ marginTop: 'var(--s-3)' }} className="stack-sm">
              {shrinks.map((s) => (
                <div key={s.id} className="notice notice-info">
                  <Icon name="lightning-charge" size={18} className="notice-icon" />
                  <div style={{ minWidth: 0 }}>
                    <p>
                      <span className="notice-label">Could be smaller. </span>
                      {s.label} and this drops from version {result.version} to version {s.version}, which means bigger,
                      easier-to-scan squares at the same printed size. {s.explain}
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ marginTop: 'var(--s-3)' }}
                      onClick={() => onApplyShrink(s.text)}
                    >
                      <Icon name="arrow-repeat" size={14} />
                      {s.label}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <details className="disclosure">
        <summary>
          <Icon name="sliders" size={16} />
          How the code is built
          <span className="summary-note" style={{ marginLeft: 'auto' }}>Sensible defaults already set</span>
          <Icon name="chevron-right" size={14} className="chev" />
        </summary>

        <div className="disclosure-body stack">
          <div className="field">
            <span className="label" id="ecc-label">
              How much damage it should survive
            </span>
            <p className="hint">
              Higher is not better: more tolerance means more, smaller squares at the same printed size. Raise it for
              codes that get handled or carry a logo.
            </p>
            <div className="segmented" role="group" aria-labelledby="ecc-label">
              {ECC_LETTERS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={encoding.ecc === l}
                  onClick={() => set({ ecc: l })}
                  title={ECC_COPY[l].detail}
                >
                  {ECC_COPY[l].label}
                </button>
              ))}
            </div>
            <p className="hint">
              <strong style={{ color: 'var(--text)' }}>{ECC_COPY[encoding.ecc].label}:</strong>{' '}
              {ECC_COPY[encoding.ecc].detail}
            </p>
          </div>

          <label className="checkbox-row" htmlFor="boost">
            <input
              id="boost"
              type="checkbox"
              checked={encoding.boostEcc}
              onChange={(e) => set({ boostEcc: e.target.checked })}
            />
            <span>
              <strong style={{ fontWeight: 600 }}>Use up any spare room for extra damage tolerance</strong>
              <span className="hint" style={{ display: 'block' }}>
                Spare space goes towards surviving damage instead of being wasted. Never makes the code bigger.
              </span>
            </span>
          </label>

          <div className="field">
            <label className="label" htmlFor="minver">
              Smallest grid to use
            </label>
            <p className="hint">
              Normally the smallest that fits. Set a floor to make a batch of codes all the same size.
            </p>
            <select
              id="minver"
              className="select"
              value={encoding.minVersion}
              onChange={(e) => set({ minVersion: Number(e.target.value) })}
            >
              <option value={1}>Automatic, smallest that fits</option>
              {Array.from({ length: 40 }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>
                  At least version {v} ({v * 4 + 17} × {v * 4 + 17} squares)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="mask">
              Pattern scrambling
            </label>
            <p className="hint">
              Eight ways of shuffling the pattern so it has no confusing blank areas. The best is picked for you.
            </p>
            <select id="mask" className="select" value={encoding.mask} onChange={(e) => set({ mask: Number(e.target.value) })}>
              <option value={-1}>Automatic (recommended)</option>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((m) => (
                <option key={m} value={m}>
                  Pattern {m}
                </option>
              ))}
            </select>
            {result && encoding.mask === -1 && <p className="hint">Currently using pattern {result.mask}.</p>}
          </div>

          {etch.result?.hasNonAscii && (
            <label className="checkbox-row" htmlFor="eci">
              <input
                id="eci"
                type="checkbox"
                checked={encoding.declareUtf8}
                onChange={(e) => set({ declareUtf8: e.target.checked })}
              />
              <span>
                <strong style={{ fontWeight: 600 }}>Add an explicit character-set marker</strong>
                <span className="hint" style={{ display: 'block' }}>
                  Accented characters already work: modern scanners detect UTF-8 themselves. This adds a formal marker
                  some older scanners handle worse. Leave it off unless yours needs it.
                </span>
              </span>
            </label>
          )}
        </div>
      </details>
    </section>
  );
}
