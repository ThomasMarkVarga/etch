import Icon from './Icon.jsx';

/**
 * Footer: source, licence, and credit where the hard parts came from.
 *
 * The encoding library credit is not a formality. Writing a QR encoder from
 * scratch would have been a worse decision than using the reference
 * implementation, and saying so is part of being honest about what this app is.
 */

const CREDITS = [
  {
    name: 'qrcodegen',
    by: 'Project Nayuki',
    url: 'https://www.nayuki.io/page/qr-code-generator-library',
    licence: 'MIT',
    what: 'the encoder itself, the part that turns bytes into a correct pattern',
  },
  {
    name: 'jsQR',
    by: 'Cosmo Wolfe',
    url: 'https://github.com/cozmo/jsQR',
    licence: 'Apache 2.0',
    what: 'the decoder that reads every code back to check it',
  },
  {
    name: 'pdf-lib',
    by: 'Andrew Dillon',
    url: 'https://pdf-lib.js.org/',
    licence: 'MIT',
    what: 'the print-ready PDF export',
  },
  { name: 'JSZip', by: 'Stuart Knightley', url: 'https://stuk.github.io/jszip/', licence: 'MIT', what: 'batch downloads' },
  {
    name: 'Bootstrap Icons',
    by: 'The Bootstrap Authors',
    url: 'https://icons.getbootstrap.com/',
    licence: 'MIT',
    what: 'the icons',
  },
  { name: 'IBM Plex', by: 'IBM', url: 'https://www.ibm.com/plex/', licence: 'SIL OFL 1.1', what: 'the typeface' },
];

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="shell" style={{ paddingBlock: 'var(--s-6)' }}>
        <div className="grid-2" style={{ alignItems: 'start', gap: 'var(--s-6)' }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 'var(--fs-18)', letterSpacing: '-0.02em' }}>Etch</p>
            <p className="hint" style={{ maxWidth: '30rem', marginTop: 'var(--s-2)' }}>
              A static QR code generator. Free, with no account, no watermark, no export limit and no paid tier,
              because there is no running cost to cover: once the page has loaded, there is no server involved in
              anything you do here.
            </p>
            <div className="row" style={{ marginTop: 'var(--s-4)', gap: 'var(--s-2)' }}>
              <a className="btn btn-sm" href="https://github.com/ThomasMarkVarga/etch" target="_blank" rel="noopener">
                <Icon name="github" size={14} />
                Source on GitHub
              </a>
              <a className="btn btn-sm" href="https://vibe-coding.fans" target="_blank" rel="noopener">
                <Icon name="box-arrow-up-right" size={14} />
                vibe-coding.fans
              </a>
            </div>
            <p className="hint" style={{ marginTop: 'var(--s-4)' }}>
              MIT licensed. Do what you like with it, including running your own copy.
            </p>
          </div>

          <div>
            <p style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>Built on other people's work</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--s-3) 0 0', display: 'grid', gap: 'var(--s-2)' }}>
              {CREDITS.map((c) => (
                <li key={c.name} className="hint">
                  <a href={c.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {c.name}
                  </a>{' '}
                  by {c.by} ({c.licence}), for {c.what}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
