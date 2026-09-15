import Icon from './Icon.jsx';

/**
 * Footer.
 *
 * Same shape as the other vibe-coding.fans apps: the pink pill linking home,
 * then small print. Laid out as a centred column rather than one dense
 * paragraph, because the previous version buried six underlined links inside a
 * block of prose and read as a wall of noise.
 *
 * Three tiers, in order of how likely anyone is to want them: the link home,
 * the handful of links people actually click, then the credits and the
 * promise. The credits are not a formality: writing a QR encoder from scratch
 * would have been a worse decision than using the reference implementation,
 * and saying whose work this is built on is part of being honest about that.
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

const SOURCE = 'https://github.com/qxZap/etch';

const LINKS = [
  { icon: 'github', label: 'Source on GitHub', href: SOURCE },
  { icon: 'shield-check', label: 'How it works', href: '#how-it-works' },
  { icon: 'question-circle', label: 'Questions', href: '#learn' },
];

const CREDITS = [
  { name: 'qrcodegen', href: 'https://www.nayuki.io/page/qr-code-generator-library', who: 'Project Nayuki', licence: 'MIT' },
  { name: 'jsQR', href: 'https://github.com/cozmo/jsQR', who: 'Cosmo Wolfe', licence: 'Apache 2.0' },
  { name: 'pdf-lib', href: 'https://pdf-lib.js.org/', who: 'Andrew Dillon', licence: 'MIT' },
  { name: 'JSZip', href: 'https://stuk.github.io/jszip/', who: 'Stuart Knightley', licence: 'MIT' },
  { name: 'Bootstrap Icons', href: 'https://icons.getbootstrap.com/', who: 'the Bootstrap authors', licence: 'MIT' },
];

export default function SiteFooter() {
  return (
    <footer className="foot">
      <div className="shell foot-inner">
        <a className="vcf-home" href="https://vibe-coding.fans/">
          <VcfMark />
          <span>
            More free apps on <b>vibe-coding.fans</b>
          </span>
        </a>

        <nav className="foot-links" aria-label="About this app">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              {...(l.href.startsWith('#') ? {} : { target: '_blank', rel: 'noopener' })}
            >
              <Icon name={l.icon} size={15} />
              {l.label}
            </a>
          ))}
        </nav>

        <hr className="foot-rule" />

        <p className="foot-credits">
          Etch is free and open source under the MIT licence. Built on{' '}
          {CREDITS.map((c, i) => (
            <span key={c.name}>
              <a href={c.href} target="_blank" rel="noopener">
                {c.name}
              </a>
              {i === CREDITS.length - 1 ? '' : i === CREDITS.length - 2 ? ' and ' : ', '}
            </span>
          ))}
          . Set in IBM Plex Sans and IBM Plex Mono, under the SIL Open Font License.
        </p>

        <p className="foot-note">
          Everything runs in your browser. Nothing is uploaded, nothing is stored, and there are no accounts, no
          cookies and no tracking. The codes are static, so they hold your data rather than a link back here and keep
          working whatever happens to this site.
        </p>

        <p className="foot-tip">
          <Icon name="printer" size={15} />
          Print one and scan it before you order a thousand of anything.
        </p>
      </div>
    </footer>
  );
}
