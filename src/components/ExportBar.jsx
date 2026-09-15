import { useState } from 'react';
import Icon from './Icon.jsx';
import Notice from './Notice.jsx';
import { downloadSvg, svgToPngBlob, saveBlob, exactPngSizes, filenameFor } from '../core/render/download.js';

/**
 * Exports.
 *
 * No format is behind a wall, there is no watermark and there is no limit.
 * The only thing gating a download is the scan test, and that gate is a
 * warning rather than a lock: someone who knows their scanner better than this
 * app does is allowed to proceed, having been told plainly.
 */

/**
 * @param {object} props
 * @param {{svg: string, totalModules: number}|null} props.svg
 * @param {import('../core/encode.js').EncodeResult|null} props.result
 * @param {string} props.typeLabel
 * @param {import('../core/verify.js').VerifyResult|null} props.verification
 * @param {import('../core/style.js').StyleSpec} props.style
 * @param {number} props.widthMm
 */
export default function ExportBar({ svg, result, typeLabel, verification, style, widthMm }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!svg || !result) return null;

  const failed = verification && !verification.pass;
  const sizes = exactPngSizes(svg.totalModules);

  const guard = async (id, fn) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That export did not work.');
    } finally {
      setBusy(null);
    }
  };

  const onSvg = () => guard('svg', async () => downloadSvg(svg.svg, filenameFor(typeLabel, 'svg')));

  const onPng = (size) =>
    guard(`png-${size.pixels}`, async () => {
      const bg = style.background === 'transparent' ? undefined : style.background;
      const blob = await svgToPngBlob(svg.svg, size.pixels, bg);
      saveBlob(blob, filenameFor(typeLabel, 'png', String(size.pixels)));
    });

  const onPdf = () =>
    guard('pdf', async () => {
      // Lazy: pdf-lib is roughly 400KB and has no business in the first load
      // of an app that has to paint in under a second on 3G.
      const { matrixToPdf } = await import('../core/render/matrixToPdf.js');
      const bytes = await matrixToPdf(result.matrix, result.version, {
        style,
        widthMm,
        title: `${typeLabel} QR code`,
        payloadType: typeLabel,
      });
      saveBlob(new Blob([bytes], { type: 'application/pdf' }), filenameFor(typeLabel, 'pdf', `${widthMm}mm`));
    });

  return (
    <div className="stack-sm">
      {failed && (
        <Notice kind="danger" word="Not ready to print">
          The scan test above failed. You can still download the file, but a code that cannot be read back here is very
          unlikely to be read off paper.
        </Notice>
      )}

      <div className="row" style={{ gap: 'var(--s-2)' }}>
        <button type="button" className="btn btn-primary" onClick={onSvg} disabled={busy === 'svg'}>
          {busy === 'svg' ? <span className="spinner" /> : <Icon name="filetype-svg" size={16} />}
          Download SVG
        </button>
        <button type="button" className="btn" onClick={onPdf} disabled={busy === 'pdf'}>
          {busy === 'pdf' ? <span className="spinner" /> : <Icon name="filetype-pdf" size={16} />}
          Print-ready PDF, {widthMm}mm
        </button>
      </div>

      <div className="row" style={{ gap: 'var(--s-2)' }}>
        <span className="hint" style={{ minWidth: '4.5rem' }}>
          PNG
        </span>
        {sizes.map((s) => (
          <button
            key={s.pixels}
            type="button"
            className="btn btn-sm"
            onClick={() => onPng(s)}
            disabled={busy === `png-${s.pixels}`}
          >
            {busy === `png-${s.pixels}` ? <span className="spinner" /> : <Icon name="file-earmark-image" size={14} />}
            {s.label}
          </button>
        ))}
      </div>

      <p className="hint">
        SVG is the one to send a printer: it is vector, so it stays sharp at any size. These PNG sizes are chosen so
        each square is a whole number of pixels ({sizes.map((s) => s.modulePx).join(', ')} px respectively), because a
        square that lands on half a pixel comes out blurred. The PDF is vector at exactly {widthMm}mm.
      </p>

      {error && (
        <Notice kind="danger">
          {error} Try a different format, or reload the page and try again.
        </Notice>
      )}
    </div>
  );
}
