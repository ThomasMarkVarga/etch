import Icon from './Icon.jsx';
import Notice, { noticeKind } from './Notice.jsx';
import {
  analysePrint,
  minimumWidthForDistance,
  PRINT_METHODS,
  PRINT_PRESETS,
  SURFACE_WARNINGS,
  mmToIn,
  inToMm,
  DISTANCE_TO_WIDTH_RATIO,
} from '../core/print.js';

/**
 * How big to print it.
 *
 * This is the question people actually have, and almost no generator answers
 * it. "What size PNG" is a proxy for it and a bad one.
 */

export default function PrintPanel({ etch, print, setPrint }) {
  const { result, style } = etch;
  const set = (patch) => setPrint((p) => ({ ...p, ...patch }));

  if (!result) return null;

  const totalModules = result.size + style.quietZone * 2;
  const analysis = analysePrint({
    widthMm: print.widthMm,
    totalModules,
    quietZone: style.quietZone,
    ecc: result.ecc,
    methodId: print.methodId,
  });
  const forDistance = minimumWidthForDistance({
    distanceMm: print.distanceMm,
    totalModules,
    ecc: result.ecc,
  });

  const metric = print.units === 'mm';
  const showLen = (mm) => (metric ? `${mm.toFixed(mm < 10 ? 1 : 0)} mm` : `${mmToIn(mm).toFixed(2)}″`);
  const tooSmall = print.widthMm < forDistance.widthMm;

  return (
    <details className="disclosure">
      <summary>
        <Icon name="printer" size={16} />
        How big to print it
        <span className="summary-note" style={{ marginLeft: 'auto' }}>
          {showLen(print.widthMm)} · squares {analysis.moduleMm.toFixed(2)}mm
        </span>
        <Icon name="chevron-right" size={14} className="chev" />
      </summary>

      <div className="disclosure-body stack">
        <div className="field">
          <span className="label">Where is it going?</span>
          <div className="chip-row">
            {PRINT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                style={{
                  cursor: 'pointer',
                  minHeight: 36,
                  borderColor: print.widthMm === p.widthMm ? 'var(--accent)' : 'var(--border)',
                  color: print.widthMm === p.widthMm ? 'var(--accent)' : 'var(--text-2)',
                }}
                onClick={() => set({ widthMm: p.widthMm, distanceMm: p.distanceMm })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <div className="segmented" role="group" aria-label="Units" style={{ flex: '0 0 auto' }}>
            {[
              { id: 'mm', label: 'mm' },
              { id: 'in', label: 'inches' },
            ].map((u) => (
              <button key={u.id} type="button" aria-pressed={print.units === u.id} onClick={() => set({ units: u.id })}>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="pw">
              Printed width {metric ? '(mm)' : '(inches)'}
            </label>
            <input
              id="pw"
              className="input input-mono"
              type="number"
              min={metric ? 5 : 0.2}
              step={metric ? 1 : 0.1}
              value={metric ? print.widthMm : Number(mmToIn(print.widthMm).toFixed(2))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) set({ widthMm: metric ? v : inToMm(v) });
              }}
            />
            <p className="hint">Including the clear border, which is what the exported file measures.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="pd">
              Read from about {metric ? '(mm)' : '(inches)'}
            </label>
            <input
              id="pd"
              className="input input-mono"
              type="number"
              min={metric ? 50 : 2}
              step={metric ? 50 : 1}
              value={metric ? print.distanceMm : Number(mmToIn(print.distanceMm).toFixed(1))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) set({ distanceMm: metric ? v : inToMm(v) });
              }}
            />
            <p className="hint">How far away the phone will be held.</p>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="pm">
            How it will be printed
          </label>
          <select id="pm" className="select" value={print.methodId} onChange={(e) => set({ methodId: e.target.value })}>
            {PRINT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="hint">{PRINT_METHODS.find((m) => m.id === print.methodId)?.note}</p>
        </div>

        <div className="card card-pad" style={{ background: 'var(--raised)' }}>
          <dl className="kv">
            <dt>Each square</dt>
            <dd>
              {analysis.moduleMm.toFixed(2)} mm / {analysis.moduleIn.toFixed(3)}″
            </dd>
            <dt>Pattern alone</dt>
            <dd>{showLen(analysis.codeOnlyMm)}</dd>
            <dt>Clear border</dt>
            <dd>{showLen(analysis.quietZoneMm)} on each side</dd>
            <dt>Readable from</dt>
            <dd>about {showLen(analysis.recommendedDistanceMm)}</dd>
          </dl>
        </div>

        {tooSmall ? (
          <Notice kind="warn" word="Too small for that distance">
            To be read from {showLen(print.distanceMm)} this code wants to be at least{' '}
            <strong>{showLen(forDistance.widthMm)}</strong> wide, not {showLen(print.widthMm)}.{' '}
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 'var(--s-2)' }}
              onClick={() => set({ widthMm: Math.ceil(forDistance.widthMm) })}
            >
              Use {Math.ceil(forDistance.widthMm)} mm
            </button>
          </Notice>
        ) : (
          <p className="hint">
            <Icon name="check-circle-fill" size={13} style={{ color: 'var(--ok)' }} /> At {showLen(print.widthMm)} this
            should read comfortably from {showLen(print.distanceMm)}.
          </p>
        )}

        {analysis.warnings.map((w, i) => (
          <Notice key={i} kind={noticeKind(w.level)}>
            {w.message}
          </Notice>
        ))}

        <details className="disclosure">
          <summary>
            Where the rule of thumb comes from
            <Icon name="chevron-right" size={14} className="chev" />
          </summary>
          <div className="disclosure-body">
            <p className="hint">
              The working rule across the industry is that a code should be printed about a tenth as wide as the
              distance it is read from, so {DISTANCE_TO_WIDTH_RATIO}:1. It is a simplification of the real
              relationship, which depends on the size of an individual square and on the resolving power of the camera
              rather than on the code's overall width.
            </p>
            <p className="hint" style={{ marginTop: 'var(--s-3)' }}>
              Two adjustments are applied on top, and both only ever make the answer bigger. A denser code has smaller
              squares at the same width, so the figure scales with the number of squares
              {forDistance.densityFactor > 1.01 ? ` (currently ${forDistance.densityFactor.toFixed(2)} times)` : ''}.
              And a low damage tolerance leaves less margin for the blur that distance adds, so it gets a little extra
              width. The plain rule would have suggested {showLen(forDistance.plainRuleMm)}; the figure used here is{' '}
              {showLen(forDistance.widthMm)}.
            </p>
          </div>
        </details>

        <details className="disclosure">
          <summary>
            Things that matter more than size
            <Icon name="chevron-right" size={14} className="chev" />
          </summary>
          <div className="disclosure-body stack-sm">
            {SURFACE_WARNINGS.map((w) => (
              <div key={w.id}>
                <p style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>{w.title}</p>
                <p className="hint">{w.body}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}
