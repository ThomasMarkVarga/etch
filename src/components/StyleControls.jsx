import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Notice from './Notice.jsx';
import { SHAPE_COPY, EYE_PAIRS, maxLogoRatio } from '../core/style.js';

/**
 * Styling, with the cost of each choice shown next to it.
 *
 * Every control here says what it does to scannability, not just what it does
 * to appearance. That is the difference between offering customisation and
 * offering a way to ruin a print run.
 */

const MODULE_SHAPES = ['square', 'rounded', 'dot'];
const PRESETS = [
  { id: 'classic', label: 'Black on white', fg: '#000000', bg: '#FFFFFF' },
  { id: 'ink', label: 'Ink on cream', fg: '#11141A', bg: '#FFFDF7' },
  { id: 'indigo', label: 'Indigo', fg: '#312E81', bg: '#FFFFFF' },
  { id: 'forest', label: 'Forest', fg: '#14532D', bg: '#FFFFFF' },
  { id: 'wine', label: 'Wine', fg: '#7F1D1D', bg: '#FFFFFF' },
];

export default function StyleControls({ etch, style, setStyle, onReset, onRaiseEcc, onLogoChange, logoPlanNote }) {
  const { contrast, logoCheck, suggestedEccForLogo, result } = etch;
  const set = (patch) => setStyle((s) => ({ ...s, ...patch }));
  const fileRef = useRef(null);
  const [logoError, setLogoError] = useState(null);

  const onLogoFile = async (file) => {
    setLogoError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) {
      setLogoError('Use a PNG, JPEG, SVG or WebP image.');
      return;
    }
    if (file.size > 512 * 1024) {
      setLogoError('That image is over 512KB. A logo in the middle of a QR code is only a few millimetres across on paper, so a small file is all you need, and a big one bloats every export.');
      return;
    }
    const href = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.readAsDataURL(file);
    }).catch((e) => {
      setLogoError(e.message);
      return null;
    });
    if (!href) return;

    onLogoChange({
      href,
      sizeRatio: 0.18,
      padding: 1,
      shape: 'square',
      plate: style.background === 'transparent' ? '#FFFFFF' : style.background,
      alt: file.name,
    });
  };

  // The largest logo this code could carry at the highest correction level.
  // The slider stops here rather than letting someone drag into a size no
  // amount of error correction can recover.
  const ceilingRatio = result ? maxLogoRatio(result.size, 'H', style.logo?.padding ?? 1) : 0.35;
  const sliderMax = Math.max(6, Math.floor(ceilingRatio * 100));

  return (
    <details className="disclosure">
      <summary>
        <span className="card-icon hue-fuchsia">
          <Icon name="palette" size={16} />
        </span>
        {/* Naming the logo here rather than hiding it behind the word
            "Appearance": adding a logo is the single most asked-for thing in
            this panel, and nobody opens a collapsed section to look for a
            feature they do not know is there. */}
        Colours, shapes and logo
        <span className="summary-note" style={{ marginLeft: 'auto' }}>
          {style.logo
            ? 'Logo added'
            : style.moduleShape === 'square' && style.foreground === '#000000'
              ? 'Standard'
              : 'Customised'}
        </span>
        <Icon name="chevron-right" size={14} className="chev" />
      </summary>

      <div className="disclosure-body stack">
        <Notice kind="info" word="Before you start">
          Every change here trades looks against the chance it scans. The test beside your code re-runs after each one.
        </Notice>

        {/* ---------------------------------------------------- colours -- */}
        <div className="field">
          <span className="label">Colours</span>
          <div className="chip-row-centered">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                style={{ cursor: 'pointer', minHeight: 36 }}
                onClick={() => set({ foreground: p.fg, background: p.bg, gradient: null })}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: p.fg,
                    border: `2px solid ${p.bg}`,
                    outline: '1px solid var(--border-strong)',
                  }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="fg">
              Pattern colour
            </label>
            <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
              <input
                id="fg"
                type="color"
                value={style.foreground}
                onChange={(e) => set({ foreground: e.target.value })}
                style={{ width: 52, height: 44, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', background: 'var(--surface)', cursor: 'pointer' }}
              />
              <input
                className="input input-mono"
                value={style.foreground}
                onChange={(e) => set({ foreground: e.target.value })}
                aria-label="Pattern colour, hex value"
                spellCheck="false"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="bg">
              Background
            </label>
            <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
              <input
                id="bg"
                type="color"
                value={style.background === 'transparent' ? '#FFFFFF' : style.background}
                onChange={(e) => set({ background: e.target.value })}
                style={{ width: 52, height: 44, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', background: 'var(--surface)', cursor: 'pointer' }}
              />
              <input
                className="input input-mono"
                value={style.background}
                onChange={(e) => set({ background: e.target.value })}
                aria-label="Background colour, hex value"
                spellCheck="false"
              />
            </div>
          </div>
        </div>

        <label className="checkbox-row" htmlFor="transparent">
          <input
            id="transparent"
            type="checkbox"
            checked={style.background === 'transparent'}
            onChange={(e) => set({ background: e.target.checked ? 'transparent' : '#FFFFFF' })}
          />
          <span>
            <strong style={{ fontWeight: 600 }}>Transparent background</strong>
            <span className="hint" style={{ display: 'block' }}>
              Whatever ends up behind it must be light and plain. Over a photo, it will not scan.
            </span>
          </span>
        </label>

        {contrast.message && (
          <Notice kind={contrast.level === 'fail' ? 'danger' : 'warn'}>
            {contrast.message}
            {contrast.ratio ? ` Measured contrast is ${contrast.ratio.toFixed(1)} to 1.` : ''}
          </Notice>
        )}
        {contrast.level === 'good' && !contrast.message && (
          <p className="hint">
            <Icon name="check-circle-fill" size={13} style={{ color: 'var(--ok)' }} /> Contrast is{' '}
            {contrast.ratio?.toFixed(1)} to 1. Comfortably enough for a camera to separate the dark squares from the
            light ones.
          </p>
        )}

        {/* ----------------------------------------------------- shapes -- */}
        <div className="field">
          <span className="label" id="shape-label">
            Square shape
          </span>
          <div className="segmented" role="group" aria-labelledby="shape-label">
            {MODULE_SHAPES.map((s) => (
              <button key={s} type="button" aria-pressed={style.moduleShape === s} onClick={() => set({ moduleShape: s })}>
                {SHAPE_COPY[s].label}
              </button>
            ))}
          </div>
          <p className="hint">{SHAPE_COPY[style.moduleShape].note}</p>
        </div>

        <div className="field">
          <span className="label" id="eye-label">
            Corner shape
          </span>
          <div className="segmented" role="group" aria-labelledby="eye-label">
            {EYE_PAIRS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={style.eyeFrame === p.frame && style.eyeBall === p.ball}
                onClick={() => set({ eyeFrame: p.frame, eyeBall: p.ball })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint">
            Ring and centre always match. Mixing them broke the code in 12 of 28 test scans, so those combinations are
            not offered.
          </p>
        </div>

        <p className="hint">
          The line between the corners stays square: it is how a scanner works out the grid.
        </p>

        {/* ------------------------------------------------------- logo -- */}
        <div className="field">
          <span className="label">Logo in the middle</span>
          <p className="hint">
            A logo covers squares that error correction has to rebuild, using budget meant for scratches and ink
            spread. Correction rises automatically to keep up.
          </p>

          {!style.logo ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="visually-hidden"
                onChange={(e) => onLogoFile(e.target.files?.[0])}
                id="logo-file"
              />
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={16} />
                  Upload a logo
                </button>
              </div>
              <p className="hint centered">
                PNG, JPEG, SVG or WebP, up to 512KB. Read in your browser, never uploaded.
              </p>
            </>
          ) : (
            <div className="stack-sm">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 'var(--s-2)' }}>
                  <img
                    src={style.logo.href}
                    alt=""
                    width={32}
                    height={32}
                    style={{ objectFit: 'contain', background: 'var(--raised)', borderRadius: 4, padding: 2 }}
                  />
                  <span className="hint wrap-anywhere">{style.logo.alt}</span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => onLogoChange(null)}>
                  <Icon name="trash" size={14} />
                  Remove
                </button>
              </div>

              {/* pdf-lib can embed PNG and JPEG and nothing else. Saying so is
                  better than letting someone discover it from a PDF with a
                  blank square where their logo should be. */}
              {style.logo.href.startsWith('data:image/svg') && (
                <Notice kind="warn" word="Not in the PDF">
                  The print-ready PDF can only carry PNG and JPEG images, so an SVG logo appears in the SVG and PNG
                  exports but leaves a blank plate in the PDF. Upload the same logo as a PNG if you need the PDF.
                </Notice>
              )}

              <div className="field">
                <label className="label" htmlFor="logosize">
                  Size: {Math.round(style.logo.sizeRatio * 100)}% of the code's width
                </label>
                <input
                  id="logosize"
                  className="range"
                  type="range"
                  min={5}
                  max={sliderMax}
                  value={Math.min(sliderMax, Math.round(style.logo.sizeRatio * 100))}
                  onChange={(e) => onLogoChange({ ...style.logo, sizeRatio: Number(e.target.value) / 100 })}
                />
                <p className="hint">
                  This code tops out at {sliderMax}%. Correction rises as you drag.
                </p>
              </div>

              <div className="segmented" role="group" aria-label="Logo plate shape">
                {['square', 'circle'].map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    aria-pressed={style.logo.shape === sh}
                    onClick={() => onLogoChange({ ...style.logo, shape: sh })}
                  >
                    {sh === 'square' ? 'Square plate' : 'Round plate'}
                  </button>
                ))}
              </div>

              {logoPlanNote && (
                <Notice kind="info" word="Code adjusted">
                  {logoPlanNote}
                </Notice>
              )}

              {logoCheck && result && (
                <>
                  <div className="progress" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(100, (logoCheck.coverage / logoCheck.ceiling) * 100)}%`,
                        background: logoCheck.level === 'fail' ? 'var(--danger)' : logoCheck.level === 'risky' ? 'var(--warn)' : 'var(--ok)',
                      }}
                    />
                  </div>
                  <p className="hint">
                    Covering {(logoCheck.coverage * 100).toFixed(1)}% of the code. The limit at the current damage
                    tolerance is {(logoCheck.ceiling * 100).toFixed(1)}%.
                  </p>
                </>
              )}

              {logoCheck?.message && (
                <Notice kind={logoCheck.level === 'fail' ? 'danger' : 'warn'}>
                  {logoCheck.message}
                  {suggestedEccForLogo && logoCheck.suggestEcc && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginTop: 'var(--s-2)' }}
                        onClick={() => onRaiseEcc(logoCheck.suggestEcc)}
                      >
                        Raise it to {logoCheck.suggestEcc}
                      </button>
                    </>
                  )}
                </Notice>
              )}
            </div>
          )}
        </div>

        {/* -------------------------------------------------- quiet zone -- */}
        <div className="field">
          <label className="label" htmlFor="qz">
            Clear border: {style.quietZone} squares
          </label>
          <input
            id="qz"
            className="range"
            type="range"
            min={4}
            max={12}
            value={style.quietZone}
            onChange={(e) => set({ quietZone: Number(e.target.value) })}
          />
          <p className="hint">
            Four is the standard minimum and this app will not go lower. Widening it is cheap insurance against a
            trimmer that drifts.
          </p>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={onReset}>
            <Icon name="arrow-repeat" size={16} />
            Back to plain black on white
          </button>
        </div>
      </div>
    </details>
  );
}

