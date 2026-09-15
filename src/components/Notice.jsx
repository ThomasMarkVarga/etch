import Icon from './Icon.jsx';

/**
 * A notice that reads as a notice without colour.
 *
 * Colour alone is not allowed to carry the meaning here: every notice has an
 * icon with a distinct silhouette and a bold leading word. That matters
 * because these warnings get read on bad monitors, in greyscale print-outs,
 * and by people who cannot tell the amber from the green.
 */

const KINDS = {
  ok: { cls: 'notice-ok', icon: 'check-circle-fill', word: 'Passed' },
  warn: { cls: 'notice-warn', icon: 'exclamation-triangle-fill', word: 'Check this' },
  danger: { cls: 'notice-danger', icon: 'x-circle-fill', word: 'Problem' },
  info: { cls: 'notice-info', icon: 'info-circle-fill', word: 'Note' },
};

/**
 * @param {object} props
 * @param {'ok'|'warn'|'danger'|'info'} props.kind
 * @param {string} [props.word] Override the leading word.
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.live] Announce changes to screen readers.
 */
export default function Notice({ kind = 'info', word, children, live = false, ...rest }) {
  const k = KINDS[kind] ?? KINDS.info;
  return (
    <div
      className={`notice ${k.cls}`}
      role={kind === 'danger' ? 'alert' : undefined}
      aria-live={live && kind !== 'danger' ? 'polite' : undefined}
      {...rest}
    >
      <Icon name={k.icon} size={18} className="notice-icon" />
      <p className="wrap-anywhere">
        <span className="notice-label">{word ?? k.word}. </span>
        {children}
      </p>
    </div>
  );
}

/**
 * Map a validation entry onto a notice kind.
 * @param {'error'|'warning'|'info'} level
 */
export function noticeKind(level) {
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warn';
  return 'info';
}
