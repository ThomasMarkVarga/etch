# Etch

**A QR code you print once and never have to reprint.**

Live at [etch.vibe-coding.fans](https://etch.vibe-coding.fans)

![Etch](public/og.png)

---

## The problem

Most free QR generators do not encode your URL. They encode *their* short link,
which redirects to your URL.

That redirect is a subscription. Stop paying, or let the company fold, and every
code you printed goes dead. People find this out after ordering 5,000 menus, or
years later when the sticker on a machine stops working. The category is full of
tools that look free and are not.

Etch encodes your data directly into the pattern. There is nothing to expire,
nothing to pay, and nothing anyone can switch off.

## Static versus dynamic, concretely

| | Static (what Etch makes) | Dynamic (what most free tools make) |
|---|---|---|
| What the code contains | Your data | The generator's short link |
| What happens when you scan | The phone reads your data | The phone visits their server, which forwards to you |
| Change the destination later | No. Reprint. | Yes, from a dashboard |
| Keeps working if the company folds | Yes | No |
| Keeps working if you stop paying | Yes | Usually not |
| Scan tracking | None possible | Yes, that is the product |
| Code density | Grows with your data | Always small |

Dynamic codes are a legitimate product and the editable destination is genuinely
useful. The problem is that the trade is rarely explained before the print run,
and the printed code outlives the subscription. Etch refuses to make one, which
is the whole point rather than a missing feature. The **Check a code** tab will
tell you which kind any existing code is.

## What it does

- **Every payload type**, with the fiddly formats actually correct: URL, text,
  Wi-Fi, vCard, meCard, email, SMS, phone, geo, calendar event, SEPA credit
  transfer (EPC069-12), app link.
- **Scan verification before download.** Etch renders your styled code, decodes
  it back with a real decoder, and compares byte for byte, under four simulated
  conditions: as exported, small, cheap printing, and a phone camera in poor
  light. No other generator does this.
- **Print maths.** Not "what size PNG" but "how big do I print this", in
  millimetres and inches, with the module size and the floor for your printing
  method.
- **Encoding parameters exposed**, each with a plain-language explanation of the
  trade-off, including optimal mode segmentation that can drop a code a whole
  version.
- **Batch mode.** Drop a CSV, get a ZIP, every row verified. Free.
- **Inspector.** Find out what an existing code really contains.
- SVG, PNG at exact pixel sizes, and print-ready vector PDF at real millimetres.

## Guarantees

- **No backend.** Static files. There is no server to send anything to.
- **Zero network requests after load.** No analytics, no font CDN, no telemetry.
  The app counts its own requests live and shows you the number.
- **No accounts, no email capture, no watermark, no export limits, no cookies.**
- **Works offline.** A service worker caches the app shell, so a print shop with
  bad Wi-Fi can still use it.
- **No AI, no wasm, no model.** This is bit manipulation and geometry.
- Enforced by a Content Security Policy with `connect-src 'self'`, so a future
  change cannot quietly start phoning home.

## The one thing this cannot promise

A statically encoded address will still be readable in thirty years. But it
points at a website, and that website lasts exactly as long as someone keeps
renewing the domain. If the code is going on something permanent, the domain is
the part to worry about, not the pattern. That is in the app too.

## Local development

```bash
npm install
npm run dev      # http://localhost:8765
npm test         # 180 tests, no browser needed
npm run build    # static dist/, deployable anywhere
```

Node 18 or newer.

## How it is built

```
src/
  core/
    encode.js          qrcodegen wrapper: version, error correction, mask
    segments.js        optimal mode segmentation (ported, see below)
    patterns.js        which modules are structure and which are data
    style.js           shapes, colours, logo coverage and contrast checks
    verify.js          the decode-your-own-output loop
    print.js           physical size maths
    render/
      matrixToSvg.js   path merging
      rasterize.js     pure-JS styled rasteriser, no canvas
      matrixToPdf.js   lazy
      download.js
  payloads/            one module per type, each separately tested
  batch/               CSV parsing; JSZip is lazy
  inspector/           image decoding and the redirect host list
  state/urlState.js    the URL hash is the state
  components/
```

`src/core` is framework free and has no DOM dependency at all, which is why the
test suite runs in Node in under three seconds.

Two implementation notes worth knowing about:

**Optimal segmentation is ported, not imported.** Nayuki's JavaScript build ships
only a simple heuristic for choosing encoding modes. The dynamic program that
finds the optimal split exists only in his Java and C++ builds. `segments.js` is
a faithful port of it, minus kanji mode, which would need a 7,000-entry
Shift-JIS table and never affects correctness. It is worth having: mixing modes
optimally drops `ABC123456789012345678901234567890` from version 3 to version 2.

**Verification rasterises in plain JavaScript.** There is no canvas in the
verification path, so the same code runs in Node and in the browser and the
guarantees in the test suite are the guarantees a user gets.

## Deploying

`npm run build` produces a static `dist/` that deploys to Cloudflare Pages with
no configuration. `public/_redirects` handles the SPA fallback and
`public/_headers` sets the CSP and cache headers.

## Credits

The hard parts are other people's work.

- **[qrcodegen](https://www.nayuki.io/page/qr-code-generator-library)** by
  Project Nayuki (MIT), vendored in `src/vendor/`. The encoder itself: the part
  that turns bytes into a correct pattern. QR is a rigidly specified standard
  where a correct implementation exists, and writing another one would have been
  a worse decision than using this.
- **[jsQR](https://github.com/cozmo/jsQR)** by Cosmo Wolfe (Apache 2.0). The
  decoder that reads every code back to check it.
- **[pdf-lib](https://pdf-lib.js.org/)** by Andrew Dillon (MIT).
- **[JSZip](https://stuk.github.io/jszip/)** by Stuart Knightley (MIT).
- **[Bootstrap Icons](https://icons.getbootstrap.com/)** (MIT), inlined.
- **[IBM Plex](https://www.ibm.com/plex/)** by IBM (SIL OFL 1.1), self-hosted.

## Licence

MIT. See [LICENSE](LICENSE). Run your own copy; that is rather the point.
