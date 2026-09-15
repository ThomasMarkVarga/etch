import Icon from './Icon.jsx';
import Notice from './Notice.jsx';

/**
 * The scan verification result.
 *
 * This is the feature no other generator has, and it sits above the download
 * buttons on purpose: the answer to "will this actually work" belongs before
 * the decision to commit, not after.
 *
 * The claim is kept honest. A pass means this exact rendering decoded
 * correctly under four simulated conditions. It is not a promise about every
 * scanner, printer and surface, and the wording never implies otherwise.
 */

/**
 * @param {object} props
 * @param {import('../core/verify.js').VerifyResult|null} props.verification
 * @param {boolean} props.verifying
 * @param {{culprit: string, label: string, revert: object}|null} props.culprit
 * @param {() => void} props.onRevert
 * @param {string|null} props.verifyError
 * @param {() => void} props.onRetry
 */
export default function VerifyPanel({ verification, verifying, culprit, onRevert, verifyError, onRetry }) {
  if (verifyError && !verifying) {
    return (
      <div className="notice notice-warn" role="alert">
        <Icon name="exclamation-triangle-fill" size={18} className="notice-icon" />
        <div style={{ minWidth: 0 }}>
          <p>
            <span className="notice-label">Could not check this code. </span>
            {verifyError} The code itself is fine and you can still download it, but it has not been read back and
            confirmed, so treat it as unchecked until this passes.
          </p>
          <div className="actions" style={{ marginTop: 'var(--s-3)', justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              <Icon name="arrow-repeat" size={14} />
              Try the check again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verifying && !verification) {
    return (
      <div className="notice" aria-live="polite">
        <span className="spinner notice-icon" aria-hidden="true" />
        <p>
          <span className="notice-label">Checking. </span>
          Reading the code back to confirm it decodes to exactly what you typed.
        </p>
      </div>
    );
  }

  if (!verification) return null;

  const { pass, conditions } = verification;
  const failed = conditions.filter((c) => !c.matched);

  return (
    <div className="stack-sm" aria-live="polite">
      <Notice kind={pass ? 'ok' : 'danger'} word={pass ? 'Scan test passed' : 'Scan test failed'}>
        {pass ? (
          <>
            This code was rendered and read back with a real decoder under {conditions.length} conditions, and every one
            returned your text exactly, character for character.
          </>
        ) : (
          <>
            {failed.length === conditions.length
              ? 'No condition could read this code back correctly.'
              : `${failed.length} of ${conditions.length} conditions could not read this code back correctly: ${failed
                  .map((f) => f.label.toLowerCase())
                  .join(', ')}.`}{' '}
            Do not print this.
          </>
        )}
      </Notice>

      {!pass && culprit && (
        <div className="notice notice-warn">
          <Icon name="exclamation-triangle-fill" size={18} className="notice-icon" />
          <div style={{ minWidth: 0 }}>
            <p>
              <span className="notice-label">Cause found. </span>
              Removing {culprit.label} makes the code pass every condition. This was measured by re-testing, not
              guessed.
            </p>
            <button type="button" className="btn btn-sm" style={{ marginTop: 'var(--s-3)' }} onClick={onRevert}>
              <Icon name="arrow-repeat" size={14} />
              Undo {culprit.label}
            </button>
          </div>
        </div>
      )}

      <details className="disclosure">
        <summary>
          What was tested
          <span className="summary-note" style={{ marginLeft: 'auto' }}>
            {conditions.filter((c) => c.matched).length} of {conditions.length} passed
          </span>
          <Icon name="chevron-right" size={14} className="chev" />
        </summary>
        <div className="disclosure-body">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
            {conditions.map((c) => (
              <li key={c.id} style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-start' }}>
                <Icon
                  name={c.matched ? 'check-circle-fill' : 'x-circle-fill'}
                  size={16}
                  style={{ marginTop: '0.2rem', color: c.matched ? 'var(--ok)' : 'var(--danger)' }}
                />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>
                    {c.label}
                    <span
                      style={{
                        marginLeft: 'var(--s-2)',
                        fontWeight: 700,
                        fontSize: 'var(--fs-12)',
                        color: c.matched ? 'var(--ok)' : 'var(--danger)',
                      }}
                    >
                      {c.matched ? 'READ CORRECTLY' : c.decoded ? 'READ THE WRONG TEXT' : 'NOT FOUND'}
                    </span>
                  </p>
                  <p className="hint">{c.why}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 'var(--s-4)' }}>
            Each test renders this exact code, decodes it with a real decoder and compares byte for byte. A strong
            signal, not a guarantee: paper, ink and lighting still matter more.
          </p>
        </div>
      </details>
    </div>
  );
}
