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
  [
    'Pick what the code should do.',
    'A website, a Wi-Fi network, a contact card, a bank transfer. Each one has its own format, and getting that format exactly right is most of the work.',
  ],
  [
    'Type your details.',
    'The code is drawn as you type, by JavaScript running in this page. Nothing is uploaded, because there is nowhere to upload it to.',
  ],
  [
    'Etch reads its own code back.',
    'Before any download, the code is rendered and then decoded again with a real decoder, under four conditions: as exported, small, cheaply printed, and photographed in poor light. You see the result before you commit.',
  ],
  [
    'Set the printed size.',
    'Say how far away people will scan it from and you get the width in millimetres, the size of one square, and a warning if your printing method cannot hold that detail.',
  ],
  [
    'Download it.',
    'SVG for the print shop, PNG for screens, PDF at exact physical size. No account, no watermark, no export limit, no paid tier.',
  ],
];

const FAQS = [
  [
    'Is this really free, with no catch?',
    'Yes, and the reason is boring rather than generous: once the page has loaded there is no server doing anything, so there is no running cost to recover. No account, no watermark, no limit on how many codes you make.',
  ],
  [
    'Will my code still work in ten years?',
    'The pattern will. It holds your data directly, so no company has to stay in business for it to keep scanning. If the code holds a web address, that address works for as long as you keep renewing the domain. That is the honest limit, and it is the one nobody mentions.',
  ],
  [
    'Can one code send iPhones to the App Store and Android phones to Google Play?',
    'No. A QR code is a fixed string of characters. Choosing a destination based on the phone needs something in the middle making that decision, which is a redirect, and a redirect is the thing this app refuses to create. Put a small page on your own domain that offers both links and encode that.',
  ],
  [
    'How big should I print it?',
    'As a rule of thumb, about a tenth of the distance it will be scanned from: 30cm away wants roughly 3cm across. Etch adjusts that for how dense your code is and tells you the size of a single square, which is what actually decides whether a printer can hold it.',
  ],
  [
    'Does putting a logo in the middle break it?',
    'It can. A logo covers squares, and those squares have to be rebuilt from the error correction, which also has to absorb scratches and ink spread. Etch works out what percentage your logo covers, caps it at about half the available budget, and then proves the result still scans.',
  ],
  [
    'Can you see what I put into the codes?',
    'No. There is no server, no analytics and no logging. The page counts its own network requests and shows you the number, which is zero. Open your browser’s developer tools and watch the Network tab while you type if you would rather check than take our word for it.',
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
          A <strong>static</strong> code contains your information. Scan it and the phone reads what is in the
          pattern. Nothing else is involved, so nothing else can fail.
        </p>
        <p>
          A <strong>dynamic</strong> code contains the generator&rsquo;s own web address. Scan it and the phone visits
          their server, which then forwards to you. That forwarding is a service, and services are paid for.
        </p>
        <p className="explainer-aside">
          Being able to change the destination later is genuinely useful, and it is what you are paying for. The trade
          is that the printed code depends on that account staying open. Most free generators make dynamic codes
          without mentioning it, which is how people find out years later, from a sticker that has stopped working.
        </p>
        <p>
          Etch only makes static codes. Use <strong>Check a code</strong> above to find out which kind any existing
          code is.
        </p>
      </Section>

      <Section eyebrow="Before you print" hue="teal" title="The four things that actually break printed codes" wide>
        <div className="explainer-cols">
          {[
            [
              'scissors',
              'Cropping the white border',
              'The blank margin around the pattern is part of the code, not padding. It is how a scanner works out where the pattern ends. Trimming into it is the single most common reason a printed code fails, and it fails after the print run rather than before.',
            ],
            [
              'aspect-ratio',
              'Printing it too small',
              'Every code has a size below which the individual squares are finer than your printer can hold, or finer than a camera can resolve at the distance people will stand. The print panel gives you that floor for your method.',
            ],
            [
              'droplet',
              'The surface it goes on',
              'Gloss laminate bounces the phone’s own light straight back. Curved bottles distort the grid. Absorbent card spreads the ink until neighbouring squares touch. Matt finishes on flat surfaces are worth the extra cost.',
            ],
            [
              'palette',
              'Styling it too hard',
              'Dots, gradients, low contrast and a large centre logo all spend the same budget that error correction needs for real-world damage. Each control here shows what it costs, and the scan test re-runs after every change.',
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
