import Icon from './Icon.jsx';

/**
 * The explainer sections under the app.
 *
 * Same shape the sibling apps use: separate cards, each with a coloured
 * eyebrow label so you can find the one you want without reading all of them.
 *
 * The content is the part of this product that is not code. Someone about to
 * order 5,000 menus has three real questions, and none of them is "what is a
 * QR code": they are "will it scan", "how big do I print it", and "will it
 * still work later". A section each.
 */

function Section({ eyebrow, hue, title, children, wide = false }) {
  return (
    <section className={`explainer hue-${hue}${wide ? ' explainer-wide' : ''}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="explainer-title">{title}</h2>
      {children}
    </section>
  );
}

const STEPS = [
  ['Pick what the code should do.', 'A website, Wi-Fi, a contact card, a bank transfer.'],
  ['Type your details.', 'The code is drawn as you type, in this page. Nothing is uploaded.'],
  [
    'Etch reads its own code back.',
    'Before any download, it decodes its own output under four conditions and shows you the result.',
  ],
  ['Set the printed size.', 'Give it a scan distance and it gives you millimetres, and a warning if your printer cannot hold that detail.'],
  ['Download it.', 'SVG, PNG or print-ready PDF. No account, no watermark, no limit.'],
];

const FAQS = [
  [
    'Is this really free, with no catch?',
    'Yes. Once the page has loaded there is no server doing anything, so there is no cost to recover. No account, no watermark, no limit.',
  ],
  [
    'Will my code still work in ten years?',
    'The pattern will: it holds your data, so no company has to stay in business. If it holds a web address, that lasts as long as you keep renewing the domain.',
  ],
  [
    'Can one code go to both the App Store and Google Play?',
    'No. A QR code is a fixed string. Branching by phone needs a redirect in the middle, which is the thing this app refuses to make. Encode a page on your own domain that offers both.',
  ],
  [
    'How big should I print it?',
    'Roughly a tenth of the scan distance: 30cm away wants about 3cm across. The print panel adjusts that for your code and printer.',
  ],
  [
    'Does a logo in the middle break it?',
    'It can. Etch measures what the logo covers, caps it, raises the error correction to match, and then proves the result still scans.',
  ],
  [
    'Can you see what I put into the codes?',
    'No. No server, no analytics, no logging. The page counts its own network requests and shows you the number.',
  ],
];

export default function Explainers() {
  return (
    <div className="explainer-grid" id="learn">
      <Section eyebrow="How it works" hue="indigo" title="Making a code, start to finish">
        <ol className="explainer-steps">
          {STEPS.map(([lead, body]) => (
            <li key={lead}>
              <strong>{lead}</strong> {body}
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="In plain words" hue="violet" title="Static or dynamic, and why it matters">
        <p>
          A <strong>static</strong> code contains your information. Nothing else is involved, so nothing else can fail.
        </p>
        <p>
          A <strong>dynamic</strong> code contains the generator&rsquo;s address, and their server forwards to you.
          That forwarding is a service, and services are paid for.
        </p>
        <p className="explainer-aside">
          Changing the destination later is genuinely useful and is what you pay for. The trade is that the printed
          code depends on that account staying open, and most free generators never mention it.
        </p>
        <p>
          Etch only makes static codes. Use <strong>Check a code</strong> above to see which kind any code is.
        </p>
      </Section>

      <Section eyebrow="Before you print" hue="teal" title="The four things that actually break printed codes" wide>
        <div className="explainer-cols">
          {[
            [
              'scissors',
              'Cropping the white border',
              'The blank margin is part of the code, not padding: it is how a scanner finds the edge. Trimming into it is the most common reason a printed code fails.',
            ],
            [
              'aspect-ratio',
              'Printing it too small',
              'Below a certain size the squares are finer than your printer can hold. The print panel gives you that floor.',
            ],
            [
              'droplet',
              'The surface it goes on',
              'Gloss bounces the light back, curves distort the grid, absorbent card spreads the ink. Matt and flat is worth paying for.',
            ],
            [
              'palette',
              'Styling it too hard',
              'Dots, low contrast and a big logo all spend the budget error correction needs for real damage. Each control shows its cost.',
            ],
          ].map(([icon, title, body]) => (
            <div key={title} className="explainer-item">
              <span className="explainer-item-icon">
                <Icon name={icon} size={16} />
              </span>
              <div>
                <h3 className="explainer-subtitle">{title}</h3>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Questions" hue="sky" title="Frequently asked questions" wide>
        <div className="explainer-cols">
          {FAQS.map(([q, a]) => (
            <div key={q} className="explainer-qa">
              <h3 className="explainer-subtitle">{q}</h3>
              <p>{a}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
