import { useEffect, useMemo, useRef, useState } from 'react';
import { tryEncode, headroom, suggestShrinks, naturalVersion } from '../core/encode.js';
import { matrixToSvg } from '../core/render/matrixToSvg.js';
import { normaliseStyle, checkContrast, checkLogo, eccForLogo } from '../core/style.js';
import { verify, findStyleCulprit, warmDecoder } from '../core/verify.js';
import { buildPayload, validatePayload, payloadType } from '../payloads/index.js';

/**
 * Everything derived from the current inputs.
 *
 * Two speeds on purpose. Encoding and rendering are fast enough to run on
 * every keystroke, so the preview feels live. Verification rasterises the code
 * four times and decodes each one, so it runs on a debounce; running the blur
 * and noise pass on every keystroke would make typing stutter for no benefit.
 */

const VERIFY_DEBOUNCE_MS = 260;

// Begin fetching the decoder as soon as this module is evaluated, so it is
// already in place by the time the first payload is typed.
warmDecoder();

/**
 * @param {object} args
 * @param {string} args.typeId
 * @param {object} args.input
 * @param {object} args.encoding
 * @param {object} args.style
 */
export function useEtch({ typeId, input, encoding, style: rawStyle }) {
  const type = payloadType(typeId);

  const text = useMemo(() => buildPayload(typeId, input), [typeId, input]);
  const issues = useMemo(() => validatePayload(typeId, input), [typeId, input]);
  const hasBlockingIssue = issues.some((i) => i.level === 'error');

  const { style, adjustments } = useMemo(() => normaliseStyle(rawStyle), [rawStyle]);

  // Encode. Never throws: an over-long payload is a message, not a crash.
  const encoded = useMemo(() => {
    if (!text || hasBlockingIssue) return null;
    return tryEncode(text, {
      ecc: encoding.ecc,
      minVersion: encoding.minVersion,
      mask: encoding.mask,
      boostEcc: encoding.boostEcc,
      declareUtf8: encoding.declareUtf8,
    });
  }, [text, hasBlockingIssue, encoding.ecc, encoding.minVersion, encoding.mask, encoding.boostEcc, encoding.declareUtf8]);

  const result = encoded?.ok ? encoded.result : null;
  const encodeError = encoded && !encoded.ok ? encoded : null;

  const room = useMemo(() => (result ? headroom(result) : null), [result]);

  const naturalV = useMemo(
    () => (text && !hasBlockingIssue ? naturalVersion(text, encoding.ecc) : null),
    [text, hasBlockingIssue, encoding.ecc],
  );

  const shrinks = useMemo(
    () => (typeId === 'url' && text && !hasBlockingIssue ? suggestShrinks(text, encoding.ecc, encoding.minVersion) : []),
    [typeId, text, hasBlockingIssue, encoding.ecc, encoding.minVersion],
  );

  const contrast = useMemo(() => checkContrast(style), [style]);

  const logoCheck = useMemo(
    () => (result ? checkLogo(result.size, style.logo, result.ecc) : null),
    [result, style.logo, result?.ecc],
  );

  const svg = useMemo(() => {
    if (!result) return null;
    return matrixToSvg(result.matrix, result.version, {
      style,
      title: `${type.label} QR code`,
      desc: buildDesc(type.label, result, style),
      idPrefix: 'etch-preview',
    });
  }, [result, style, type.label]);

  /* ------------------------------------------------------------ verify -- */

  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [culprit, setCulprit] = useState(null);
  const runId = useRef(0);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!result) {
      setVerification(null);
      setCulprit(null);
      setVerifying(false);
      setVerifyError(null);
      return undefined;
    }

    const id = ++runId.current;
    setVerifying(true);
    setVerifyError(null);

    const timer = setTimeout(() => {
      /*
        Deliberately not requestAnimationFrame.

        rAF was here to yield before a long synchronous verification, but rAF
        callbacks do not fire at all while a tab is hidden or occluded, so
        switching away mid-type left the panel showing "Checking" for ever and
        the check never ran. The debounce above already provides the yield, and
        this way the result does not depend on the page being painted.
      */
      const run = async () => {
        if (runId.current !== id) return;
        try {
          const v = await verify(result.matrix, result.version, result.text, { style });
          // A newer run started while this one was decoding, so its answer is
          // the one that belongs on screen.
          if (runId.current !== id) return;
          setVerification(v);
          setCulprit(v.pass ? null : await findStyleCulprit(result.matrix, result.version, result.text, style));
          if (runId.current !== id) return;
          setVerifying(false);
        } catch (err) {
          // The decoder is fetched on demand, so a dropped connection or a
          // deploy mid-session can stop it arriving. Without this the panel
          // would sit on "Checking" for ever, which is the one outcome worse
          // than saying the check could not run.
          if (runId.current !== id) return;
          setVerification(null);
          setCulprit(null);
          setVerifyError(
            err instanceof Error && /import|fetch|network/i.test(err.message)
              ? 'The scan checker could not be loaded, which usually means the connection dropped.'
              : 'The scan check could not be completed.',
          );
          setVerifying(false);
        }
      };
      void run();
    }, VERIFY_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [result, style, retryToken]);

  return {
    type,
    text,
    issues,
    hasBlockingIssue,
    style,
    styleAdjustments: adjustments,
    result,
    encodeError,
    headroom: room,
    naturalVersion: naturalV,
    shrinks,
    contrast,
    logoCheck,
    suggestedEccForLogo: style.logo && result ? eccForLogo(result.size, style.logo) : null,
    svg,
    verification,
    verifying,
    verifyError,
    retryVerification: () => setRetryToken((n) => n + 1),
    culprit,
  };
}

/**
 * The <desc> written into every exported SVG, so the file says what it is
 * without anyone having to scan it.
 */
function buildDesc(typeLabel, result, style) {
  const parts = [
    `Static QR code holding a ${typeLabel.toLowerCase()} payload.`,
    `Version ${result.version}, ${result.size} by ${result.size} squares,`,
    `error correction ${result.ecc}, mask ${result.mask},`,
    `with a ${style.quietZone}-square clear border included.`,
    'The data is encoded in the pattern itself: there is no redirect and no dependency on any website.',
  ];
  return parts.join(' ');
}
