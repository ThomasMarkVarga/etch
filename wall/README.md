# Etch, for the vibe-coding.fans wall

Two deliverables, both generated from the app's own encoder and both verified
before they are written:

| File | What it is |
|---|---|
| `preview-etch.html` | The animated card preview. Drop into the `.app-preview` wrapper. |
| `preview-etch.css` | Its styles. Paste next to `.preview-ps` / `.preview-ov` / `.preview-bd`. |
| `etch-preview.gif` | The same animation as a GIF, 480×300, 6s loop, for the listing. |
| `demo.html` | A standalone page to watch it, at wall size and at double size. |
| `qr-paths.json` | The generated path data and the checks it passed. |

## Dropping it in

The markup follows the pattern the other three previews already use:

```html
<article class="project" aria-labelledby="etch-title">
  <p class="feat-sticker">Featured</p>
  <div class="project-inner">
    <div class="project-top">
      <img class="project-logo" src="projects/etch.svg" alt="" width="56" height="56">
      <div>
        <h3 id="etch-title">Etch</h3>
        <a class="project-host" href="https://etch.vibe-coding.fans/">etch.vibe-coding.fans</a>
      </div>
    </div>

    <div class="app-preview">
      <!-- paste preview-etch.html here -->
    </div>

    <div class="project-copy">
      <p class="pitch">A QR code you print once and never have to reprint.</p>
      <p>Most free generators encode their own short link and redirect it to
         yours, so the code dies when they do. Etch encodes your data directly,
         in your browser.</p>
      <ul class="facts">
        <li><svg class="i" aria-hidden="true" focusable="false"><use href="#i-check"></use></svg>Static codes only: no redirect, no account, nothing to expire</li>
        <li><svg class="i" aria-hidden="true" focusable="false"><use href="#i-check"></use></svg>Reads its own output back before any download, under four scan conditions</li>
        <li><svg class="i" aria-hidden="true" focusable="false"><use href="#i-check"></use></svg>Tells you how big to print it, in millimetres, for your printing method</li>
      </ul>
    </div>
  </div>
</article>
```

## What the animation shows

One loop, six seconds, the same beats in the CSS and in the GIF:

| Time | Beat |
|---|---|
| 0.0–1.3s | the address types itself |
| 1.3–2.3s | the code builds, in the brand indigo |
| 2.2–2.6s | the Etch mark lands in the middle |
| 2.3–4.3s | a scan line passes over it |
| 2.4–3.7s | four scan conditions tick through |
| 4.4–6.0s | the pass badge lands and holds |

It shows the one thing no other QR generator does: the app decodes its own
output and tells you whether it worked, before you commit to a print run.

## Things that are deliberate

**The QR is real, and verified.** It encodes `https://etch.vibe-coding.fans/`
and decodes back to exactly that. Both images are checked by reading the
finished artwork back with a real decoder, not by trusting the drawing code. A
QR generator whose own marketing carries a code that does not scan would be
making precisely the mistake it exists to prevent.

**Indigo with a centre logo is itself a test.** Both are choices the app warns
users about. Indigo on white measures 7.9:1, inside the safe band, and the mark
covers 7.6% of the code against a 9.6% ceiling at this size and error
correction level. The build fails if either slips.

**Reduced motion is handled.** `@media (prefers-reduced-motion: reduce)` pins
the finished state rather than stopping on a blank frame, so the card still
reads as "code made, four checks passed".

**It scales.** Sizing is in container units, so it holds together at the 195px
the wall renders it at and at any larger size. There is a px fallback tuned for
195px where container queries are unavailable.

## Regenerating

```bash
node scripts/make-wall-qr.mjs    # the verified QR path data
node scripts/make-wall-gif.mjs   # the GIF
```

Both refuse to write a file whose code does not decode.
