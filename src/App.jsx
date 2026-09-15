import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './components/Icon.jsx';
import Notice from './components/Notice.jsx';
import PayloadForm from './components/PayloadForm.jsx';
import CodePreview, { TrueSizePreview } from './components/CodePreview.jsx';
import VerifyPanel from './components/VerifyPanel.jsx';
import ExportBar from './components/ExportBar.jsx';
import EncodingControls from './components/EncodingControls.jsx';
import StyleControls from './components/StyleControls.jsx';
import PrintPanel from './components/PrintPanel.jsx';
import TrustPanel from './components/TrustPanel.jsx';
import ShareBar from './components/ShareBar.jsx';
import Showcase from './components/Showcase.jsx';
import Explainers from './components/Explainers.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import { useEtch } from './hooks/useEtch.js';
import { useTheme } from './hooks/useTheme.js';
import { useUrlState } from './state/urlState.js';
import { payloadType } from './payloads/index.js';
import { DEFAULT_STYLE } from './core/style.js';

const BatchMode = lazy(() => import('./components/BatchMode.jsx'));
const Inspector = lazy(() => import('./components/Inspector.jsx'));

/** @type {{id: string, label: string, icon: string}[]} */
const MODES = [
  { id: 'create', label: 'Make a code', icon: 'grid-3x3-gap' },
  { id: 'batch', label: 'Many at once', icon: 'table' },
  { id: 'inspect', label: 'Check a code', icon: 'search' },
];

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

export default function App() {
  const [mode, setMode] = useState('create');
  const { theme, setTheme } = useTheme();

  const urlState = useUrlState();
  const [typeId, setTypeId] = useState(urlState.initial.typeId);
  const [inputs, setInputs] = useState(urlState.initial.inputs);
  const [encoding, setEncoding] = useState(urlState.initial.encoding);
  const [style, setStyle] = useState(urlState.initial.style);
  const [print, setPrint] = useState(urlState.initial.print);

  const input = inputs[typeId] ?? {};

  const etch = useEtch({ typeId, input, encoding, style });

  // Keep the link in the address bar in step with the code, except for the
  // payload types that must never appear in a shareable URL.
  useEffect(() => {
    urlState.sync({ typeId, input, encoding, style, print });
  }, [typeId, input, encoding, style, print, urlState]);

  // The page title says what is being generated, so a tab full of codes is
  // still navigable.
  useEffect(() => {
    const label = payloadType(typeId).label;
    document.title = etch.result
      ? `${label} code, version ${etch.result.version} | Etch`
      : 'Etch: a QR code you print once and never have to reprint';
  }, [typeId, etch.result]);

  const patchInput = useCallback(
    (patch) => setInputs((prev) => ({ ...prev, [typeId]: { ...(prev[typeId] ?? {}), ...patch } })),
    [typeId],
  );

  const onTypeChange = useCallback(
    (id) => {
      setTypeId(id);
      const recommended = payloadType(id).recommendedEcc;
      if (recommended) setEncoding((e) => ({ ...e, ecc: recommended }));
    },
    [],
  );

  const revertCulprit = useCallback(() => {
    if (etch.culprit) setStyle((s) => ({ ...s, ...etch.culprit.revert }));
  }, [etch.culprit]);

  const resetStyle = useCallback(() => setStyle({ ...DEFAULT_STYLE }), []);

  // Applying a suggested shrink rewrites the payload field itself, so the
  // change is visible and editable rather than happening invisibly behind the
  // form. Only the URL type produces these suggestions.
  const applyShrink = useCallback((nextText) => patchInput({ url: nextText }), [patchInput]);

  const raiseEccForLogo = useCallback((letter) => setEncoding((e) => ({ ...e, ecc: letter })), []);

  const altText = useMemo(() => {
    if (!etch.result) return 'No code yet';
    return `QR code holding a ${etch.type.label.toLowerCase()} payload. Version ${etch.result.version}, ${etch.result.size} by ${etch.result.size} squares, with the clear border included.`;
  }, [etch.result, etch.type.label]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the code
      </a>

      <header className="shell" style={{ paddingBlock: 'var(--s-4)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--s-2)',
              textDecoration: 'none',
              color: 'var(--text)',
            }}
          >
            <EtchMark />
            <span style={{ fontWeight: 700, fontSize: 'var(--fs-18)', letterSpacing: '-0.02em' }}>Etch</span>
          </a>

          {/* The source link lives in the footer now, where the rest of the
              credits are. The header keeps one control. */}
          <ThemeButton theme={theme} setTheme={setTheme} />
        </div>
      </header>

      <main id="main" className="shell" style={{ paddingBottom: 'var(--s-8)' }}>
        <Hero />

        <nav aria-label="What you want to do" style={{ margin: 'var(--s-6) 0 var(--s-5)' }}>
          <div className="segmented" style={{ maxWidth: '34rem', marginInline: 'auto' }} role="tablist">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                style={{ minHeight: 40 }}
              >
                <Icon name={m.icon} size={15} />
                {m.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="with-rail">
          <div style={{ minWidth: 0 }}>
            {mode === 'create' && (
              <CreateMode
                etch={etch}
                typeId={typeId}
                input={input}
                patchInput={patchInput}
                onTypeChange={onTypeChange}
                encoding={encoding}
                setEncoding={setEncoding}
                style={style}
                setStyle={setStyle}
                resetStyle={resetStyle}
                print={print}
                setPrint={setPrint}
                revertCulprit={revertCulprit}
                applyShrink={applyShrink}
                raiseEccForLogo={raiseEccForLogo}
                altText={altText}
                urlState={urlState}
              />
            )}

            {mode === 'batch' && (
              <Suspense fallback={<LoadingPanel what="the batch tools" />}>
                <BatchMode encoding={encoding} style={style} />
              </Suspense>
            )}

            {mode === 'inspect' && (
              <Suspense fallback={<LoadingPanel what="the inspector" />}>
                <Inspector />
              </Suspense>
            )}

            <TrustPanel />
            <Explainers />
          </div>

          <Showcase />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function CreateMode({
  etch,
  typeId,
  input,
  patchInput,
  onTypeChange,
  encoding,
  setEncoding,
  style,
  setStyle,
  resetStyle,
  print,
  setPrint,
  revertCulprit,
  applyShrink,
  raiseEccForLogo,
  altText,
  urlState,
}) {
  return (
    // Layout lives entirely in the stylesheet: an inline grid-template-columns
    // would beat the media query, because inline styles outrank class rules
    // whatever the breakpoint says.
    <div className="create-grid">
      <div className="stack" style={{ minWidth: 0 }}>
        <section className="card card-pad" aria-labelledby="h-payload">
          <h2 id="h-payload" className="card-title" style={{ marginBottom: 'var(--s-4)', display: 'inline-flex', alignItems: 'center', gap: 'var(--s-3)' }}>
            <span className={`card-icon hue-${etch.type.hue}`}>
              <Icon name={etch.type.icon} size={17} />
            </span>
            What goes in the code
          </h2>
          <PayloadForm
            typeId={typeId}
            input={input}
            onChange={patchInput}
            onTypeChange={onTypeChange}
            issues={etch.issues}
          />
        </section>

        <EncodingControls etch={etch} encoding={encoding} setEncoding={setEncoding} onApplyShrink={applyShrink} />
        <StyleControls
          etch={etch}
          style={style}
          setStyle={setStyle}
          onReset={resetStyle}
          onRaiseEcc={raiseEccForLogo}
        />
        <PrintPanel etch={etch} print={print} setPrint={setPrint} />
      </div>

      <div className="stack" style={{ minWidth: 0 }} id="preview">
        <section className="card" aria-labelledby="h-preview">
          <div className="card-head">
            <h2 id="h-preview" className="card-title">
              <span className="card-icon hue-indigo">
                <Icon name="grid-3x3-gap" size={17} />
              </span>
              Your code
            </h2>
            {etch.result && (
              <span className="chip stat">
                v{etch.result.version} · {etch.result.size}×{etch.result.size}
              </span>
            )}
          </div>

          <div className="card-pad stack">
            <CodePreview
              svg={etch.svg}
              alt={altText}
              empty={
                etch.hasBlockingIssue
                  ? 'Fill in the fields above and your code appears here.'
                  : 'Your code appears here as you type.'
              }
            />

            {etch.encodeError && (
              <Notice kind="danger">
                {etch.encodeError.error} {etch.encodeError.detail}
              </Notice>
            )}

            <p className="hint">
              The pale border around the pattern is part of the code, not padding. Every export includes it, and
              cropping into it is the most common reason a printed code fails.
            </p>

            <VerifyPanel
              verification={etch.verification}
              verifying={etch.verifying}
              verifyError={etch.verifyError}
              onRetry={etch.retryVerification}
              culprit={etch.culprit}
              onRevert={revertCulprit}
            />

            <hr className="divider" style={{ margin: 'var(--s-2) 0' }} />

            <ExportBar
              svg={etch.svg}
              result={etch.result}
              typeLabel={etch.type.label}
              verification={etch.verification}
              style={etch.style}
              widthMm={print.widthMm}
            />

            <ShareBar urlState={urlState} typeId={typeId} hasCode={!!etch.result} />
          </div>
        </section>

        {etch.svg && print.widthMm && (
          <details className="disclosure">
            <summary>
              See it at real size
              <span className="summary-note" style={{ marginLeft: 'auto' }}>{print.widthMm}mm</span>
              <Icon name="chevron-right" size={14} className="chev" />
            </summary>
            <div className="disclosure-body">
              <TrueSizePreview svg={etch.svg} widthMm={print.widthMm} alt={`${altText} Shown at ${print.widthMm} millimetres wide.`} />
            </div>
          </details>
        )}

        <section className="card card-pad" aria-labelledby="h-support">
          <h2 id="h-support" className="card-title" style={{ marginBottom: 'var(--s-3)', display: 'inline-flex', alignItems: 'center', gap: 'var(--s-3)' }}>
            <span className="card-icon hue-sky">
              <Icon name="phone" size={17} />
            </span>
            How phones handle this type
          </h2>
          <p className="hint">{etch.type.support}</p>
        </section>
      </div>
    </div>
  );
}

/** Each promise gets its own colour, so the row reads as four things. */
const HERO_CHIPS = [
  { icon: 'patch-check', label: 'No signup', hue: 'indigo' },
  { icon: 'wifi-off', label: 'Works offline', hue: 'cyan' },
  { icon: 'shield-check', label: 'Nothing leaves your browser', hue: 'teal' },
  { icon: 'lightning-charge', label: 'Every export free', hue: 'fuchsia' },
];

function Hero() {
  return (
    <div className="centered" style={{ maxWidth: '46rem', marginInline: 'auto' }}>
      <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, var(--fs-42))', fontWeight: 700, letterSpacing: '-0.033em' }}>
        A QR code you print once and{' '}
        <span className="hero-accent">never have to reprint</span>.
      </h1>
      <p
        style={{
          marginTop: 'var(--s-4)',
          marginInline: 'auto',
          fontSize: 'var(--fs-18)',
          color: 'var(--text-2)',
          maxWidth: '40rem',
        }}
      >
        Most free generators encode <em>their</em> short link and redirect it to yours. That redirect is a
        subscription: stop paying, or let the company fold, and every code you printed goes dead. Etch puts your data
        straight into the pattern, in your browser. Nothing to expire, nothing to pay, nothing anyone can switch off.
      </p>
      <div className="chip-row-centered" style={{ marginTop: 'var(--s-5)' }}>
        {HERO_CHIPS.map((c) => (
          <span key={c.label} className={`chip chip-hued hue-${c.hue}`}>
            <Icon name={c.icon} size={14} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ThemeButton({ theme, setTheme }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon-stars'} size={16} />
      <span aria-hidden="true">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
}

function LoadingPanel({ what }) {
  return (
    <div className="card card-pad" aria-live="polite">
      <p className="row">
        <span className="spinner" aria-hidden="true" /> Loading {what}.
      </p>
    </div>
  );
}

function EtchMark() {
  // The mark is a QR finder pattern, which is the one shape everyone already
  // recognises as "a QR code" even at 24 pixels.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <rect width="26" height="26" rx="7" fill="var(--accent)" />
      <path d="M6 6h7v7H6z" fill="none" stroke="var(--on-accent)" strokeWidth="2" />
      <rect x="9" y="9" width="1.5" height="1.5" fill="var(--on-accent)" />
      <path d="M16 6h4v2h-4zM18 8h2v3h-2zM6 16h2v4H6zM10 16h3v2h-3zM16 16h4v4h-4z" fill="var(--on-accent)" />
    </svg>
  );
}
