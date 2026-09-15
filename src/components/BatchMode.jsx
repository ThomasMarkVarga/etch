import { useCallback, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Notice from './Notice.jsx';
import { parseCsv, splitHeader, safeFilename } from '../batch/csv.js';
import { encode } from '../core/encode.js';
import { matrixToSvg } from '../core/render/matrixToSvg.js';
import { verify } from '../core/verify.js';
import { saveBlob } from '../core/render/download.js';
import { svgToPngBlob } from '../core/render/download.js';

/**
 * Batch mode.
 *
 * Paste or drop a CSV, get a ZIP of individually named files. Every row is
 * verified, and rows that fail are reported by row number rather than being
 * quietly included in the archive.
 *
 * Work is chunked with a yield between chunks so a batch of several hundred
 * never locks the tab. Verification is the expensive part, by roughly an order
 * of magnitude, so the progress bar is driven by rows verified rather than by
 * rows encoded.
 */

const CHUNK = 8;
const SAMPLE = `name,url
Table 1,https://example.com/menu?t=1
Table 2,https://example.com/menu?t=2
Terasă,https://example.com/menu?t=terasa`;

export default function BatchMode({ encoding, style }) {
  const [raw, setRaw] = useState('');
  const [format, setFormat] = useState('svg');
  const [nameCol, setNameCol] = useState(0);
  const [dataCol, setDataCol] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const cancelled = useRef(false);
  const fileRef = useRef(null);

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      const rows = parseCsv(raw);
      return splitHeader(rows);
    } catch {
      return null;
    }
  }, [raw]);

  const onFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('That file is over 5MB. Split it into smaller batches.');
      return;
    }
    setRaw(await file.text());
  }, []);

  const run = useCallback(async () => {
    if (!parsed) return;
    cancelled.current = false;
    setRunning(true);
    setReport(null);
    setError(null);

    const rows = parsed.body;
    setProgress({ done: 0, total: rows.length, label: 'Starting' });

    try {
      // Lazy: JSZip is only ever needed by this panel.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const taken = new Set();
      const failures = [];
      let made = 0;

      for (let i = 0; i < rows.length; i += CHUNK) {
        if (cancelled.current) break;

        for (let j = i; j < Math.min(i + CHUNK, rows.length); j++) {
          const row = rows[j];
          const text = (row[dataCol] ?? '').trim();
          const label = (row[nameCol] ?? '').trim();
          const rowNumber = j + 1 + (parsed.hadHeader ? 1 : 0);

          if (!text) {
            failures.push({ row: rowNumber, label, reason: 'The data column is empty on this row.' });
            continue;
          }

          try {
            const result = encode(text, encoding);
            const svg = matrixToSvg(result.matrix, result.version, {
              style,
              title: label || `Code ${j + 1}`,
              desc: `Static QR code for ${label || 'row ' + rowNumber}. Version ${result.version}, error correction ${result.ecc}, quiet zone included.`,
              idPrefix: `etch-${j}`,
            });

            const check = await verify(result.matrix, result.version, text, { style });
            if (!check.pass) {
              failures.push({
                row: rowNumber,
                label,
                reason: `Failed the scan test under: ${check.failedIds.join(', ')}. Not included in the ZIP.`,
              });
              continue;
            }

            const name = safeFilename(label || text, j, taken);
            if (format === 'svg') {
              zip.file(`${name}.svg`, svg.svg);
            } else {
              const blob = await svgToPngBlob(svg.svg, svg.totalModules * 12, style.background === 'transparent' ? undefined : style.background);
              zip.file(`${name}.png`, blob);
            }
            made += 1;
          } catch (err) {
            failures.push({
              row: rowNumber,
              label,
              reason: err instanceof Error ? err.message : 'Could not be encoded.',
            });
          }
        }

        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length, label: 'Building and checking' });
        // Yield, so the tab keeps painting and the cancel button keeps working.
        await new Promise((r) => setTimeout(r, 0));
      }

      if (cancelled.current) {
        setRunning(false);
        setProgress({ done: 0, total: 0, label: '' });
        return;
      }

      if (made === 0) {
        setError('Not one row produced a code that passed the scan test, so there is nothing to download. The report below says why.');
        setReport({ made, failures, total: rows.length });
        setRunning(false);
        return;
      }

      if (failures.length) {
        zip.file(
          'FAILED-ROWS.txt',
          [
            'These rows are not in this archive.',
            '',
            ...failures.map((f) => `Row ${f.row}${f.label ? ` (${f.label})` : ''}: ${f.reason}`),
          ].join('\n'),
        );
      }

      setProgress({ done: rows.length, total: rows.length, label: 'Compressing' });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveBlob(blob, `etch-batch-${made}-codes.zip`);
      setReport({ made, failures, total: rows.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The batch could not be built.');
    } finally {
      setRunning(false);
    }
  }, [parsed, dataCol, nameCol, encoding, style, format]);

  return (
    <section className="card" aria-labelledby="h-batch">
      <div className="card-head">
        <h2 id="h-batch" className="card-title">
          Many codes at once
        </h2>
      </div>

      <div className="card-pad stack">
        <p className="hint">
          Paste a spreadsheet column or drop a CSV, and get a ZIP with one file per row, named from a column you
          choose. Every row is checked with the same scan test as a single code, and any row that fails is left out of
          the archive and listed in a report rather than shipped broken.
        </p>

        <div className="field">
          <label className="label" htmlFor="csv">
            Your rows
          </label>
          <textarea
            id="csv"
            className="textarea input-mono"
            style={{ minHeight: '9rem' }}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={SAMPLE}
            spellCheck="false"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
          />
          <div className="actions">
            <input
              ref={fileRef}
              id="csvfile"
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="visually-hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={14} />
              Choose a CSV
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRaw(SAMPLE)}>
              Use an example
            </button>
          </div>
        </div>

        {parsed && parsed.body.length > 0 && (
          <>
            <div className="grid-2">
              <div className="field">
                <label className="label" htmlFor="datacol">
                  Column holding the data
                </label>
                <select id="datacol" className="select" value={dataCol} onChange={(e) => setDataCol(Number(e.target.value))}>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="namecol">
                  Column to name the files
                </label>
                <select id="namecol" className="select" value={nameCol} onChange={(e) => setNameCol(Number(e.target.value))}>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <span className="label" id="fmt-label">
                File format
              </span>
              <div className="segmented" role="group" aria-labelledby="fmt-label" style={{ maxWidth: '16rem' }}>
                {['svg', 'png'].map((f) => (
                  <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label" style={{ marginBottom: 'var(--s-2)' }}>
                First few rows
              </p>
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Name</th>
                      <th scope="col">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.body.slice(0, 4).map((r, i) => (
                      <tr key={i}>
                        <td className="stat">{i + 1 + (parsed.hadHeader ? 1 : 0)}</td>
                        <td>{r[nameCol] ?? ''}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-13)' }}>
                          {(r[dataCol] ?? '').slice(0, 44)}
                          {(r[dataCol] ?? '').length > 44 ? '…' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint" style={{ marginTop: 'var(--s-2)' }}>
                {parsed.body.length} rows found{parsed.hadHeader ? ', with the first row used as column names' : ''}.
              </p>
            </div>

            {running ? (
              <div className="stack-sm" aria-live="polite">
                <div className="progress">
                  <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <p className="hint">
                    {progress.label}: {progress.done} of {progress.total}
                  </p>
                  <button type="button" className="btn btn-sm" onClick={() => (cancelled.current = true)}>
                    Stop
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={run} disabled={parsed.body.length === 0}>
                  <Icon name="file-earmark-zip" size={16} />
                  Build {parsed.body.length} codes and download the ZIP
                </button>
              </div>
            )}
          </>
        )}

        {error && <Notice kind="danger">{error}</Notice>}

        {report && (
          <div className="stack-sm">
            <Notice kind={report.failures.length === 0 ? 'ok' : 'warn'}>
              {report.made} of {report.total} rows produced a code that passed the scan test
              {report.failures.length > 0
                ? `. ${report.failures.length} did not and were left out of the archive, with a FAILED-ROWS.txt inside explaining each one.`
                : ' and are in the ZIP.'}
            </Notice>

            {report.failures.length > 0 && (
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Name</th>
                      <th scope="col">Why it was left out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.failures.slice(0, 50).map((f, i) => (
                      <tr key={i}>
                        <td className="stat">{f.row}</td>
                        <td>{f.label}</td>
                        <td style={{ whiteSpace: 'normal' }}>{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
