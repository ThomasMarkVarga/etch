/**
 * Footer.
 *
 * Deliberately the same shape as the other vibe-coding.fans apps: the pink
 * pill linking home, then small print in prose rather than a list. PasteSafe,
 * Overlap and BridgeDays all do exactly this, and a visitor arriving from the
 * wall should land somewhere that feels like the same place.
 *
 * The credits are not a formality. Writing a QR encoder from scratch would
 * have been a worse decision than using the reference implementation, and
 * saying whose work this is built on is part of being honest about that.
 */

/** The vibe-coding.fans mark, as the sibling apps embed it. */
function VcfMark() {
  return (
    <svg viewBox="0 0 66 66" width="30" height="30" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="58" height="58" rx="16" fill="#0B0B0F" />
      <rect x="2" y="2" width="54" height="54" rx="14" fill="#FF4FA3" stroke="#0B0B0F" strokeWidth="4" />
      <path
        d="M26 18 13 29l13 11M33 18h7.5a5.5 5.5 0 0 1 0 11H36m4.5 0a5.5 5.5 0 0 1 0 11H33"
        fill="none"
        stroke="#0B0B0F"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SOURCE = 'https://github.com/ThomasMarkVarga/etch';

export default function SiteFooter() {
  return (
    <footer className="foot">
      <div className="shell">
        <a className="vcf-home" href="https://vibe-coding.fans/">
          <VcfMark />
          <span>
            More free apps on <b>vibe-coding.fans</b>
          </span>
        </a>

        <p className="hint">
          <a href={SOURCE} target="_blank" rel="noopener">
            Source on GitHub
          </a>
          , MIT License. QR encoding by{' '}
          <a href="https://www.nayuki.io/page/qr-code-generator-library" target="_blank" rel="noopener">
            qrcodegen
          </a>{' '}
          from Project Nayuki, MIT License. Decoding by{' '}
          <a href="https://github.com/cozmo/jsQR" target="_blank" rel="noopener">
            jsQR
          </a>{' '}
          by Cosmo Wolfe, Apache License 2.0. PDF export by{' '}
          <a href="https://pdf-lib.js.org/" target="_blank" rel="noopener">
            pdf-lib
          </a>
          , batch archives by{' '}
          <a href="https://stuk.github.io/jszip/" target="_blank" rel="noopener">
            JSZip
          </a>
          , icons from{' '}
          <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener">
            Bootstrap Icons
          </a>
          , all MIT License. Fonts: IBM Plex Sans and IBM Plex Mono, SIL Open Font License.
        </p>

        <p className="hint">
          Everything runs in your browser. Nothing is uploaded, nothing is stored, and there are no accounts, no
          cookies and no tracking. The codes this makes are static: they contain your data rather than a link back
          here, so they keep working whatever happens to this site.
        </p>

        <p className="hint">Print a test code and scan it before you order a thousand of anything.</p>
      </div>
    </footer>
  );
}
