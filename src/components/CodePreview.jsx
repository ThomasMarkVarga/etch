import Icon from './Icon.jsx';

/**
 * The code itself.
 *
 * Two rules here are not negotiable, whatever the rest of the design does:
 *
 *  1. The surround is never white. The code's own background is white and the
 *     four-square clear border is part of the code. On a white page that
 *     border is invisible, and invisible borders get cropped off by whoever
 *     places the artwork.
 *  2. The code does not follow the theme. What is on screen is what gets
 *     printed. A preview that flipped to light-on-dark at night would be
 *     showing a file that does not exist.
 */

/**
 * @param {object} props
 * @param {{svg: string}|null} props.svg
 * @param {string} props.alt
 * @param {boolean} [props.showQuietZoneGuide]
 * @param {React.ReactNode} [props.empty]
 */
export default function CodePreview({ svg, alt, showQuietZoneGuide = true, empty }) {
  if (!svg) {
    return (
      <div className="preview-canvas" style={{ minHeight: '18rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '22rem', color: 'var(--text)' }}>
          <Icon name="grid-3x3-gap" size={32} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: 'var(--s-3)', fontSize: 'var(--fs-14)' }}>{empty ?? 'Your code appears here as you type.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-canvas">
      <div className={showQuietZoneGuide ? 'quiet-zone-guide' : undefined} style={{ width: '100%', maxWidth: '21rem' }}>
        <img
          className="preview-code"
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.svg)}`}
          alt={alt}
          width={512}
          height={512}
          draggable="false"
        />
      </div>
    </div>
  );
}

/**
 * A true-to-size preview, in real millimetres.
 *
 * Browsers assume 96 CSS pixels per inch, so a millimetre value in CSS is
 * physically accurate only if the display's real pixel density matches. On
 * most laptops it is close; on a scaled 4K panel it is not. The caption says
 * so rather than implying a precision the browser cannot deliver.
 */
export function TrueSizePreview({ svg, widthMm, alt }) {
  if (!svg) return null;
  return (
    <div className="stack-sm">
      <div className="truesize-sheet" style={{ minHeight: `${Math.min(widthMm + 24, 240)}mm` }}>
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.svg)}`}
          alt={alt}
          style={{ width: `${widthMm}mm`, height: `${widthMm}mm`, display: 'block' }}
        />
      </div>
      <p className="hint">
        Shown at {widthMm}mm across, including the clear border. Hold a ruler to the screen to check: browsers assume a
        fixed pixel density, so on a scaled or high-density display this can be out by a few percent. The exported PDF
        is exact.
      </p>
    </div>
  );
}
