/**
 * A small animated GIF encoder.
 *
 * Written rather than depended on for the same reason the PNG writer in
 * make-og.mjs is: this runs at build time to produce one file, and a whole
 * image library for that is the wrong trade. GIF needs a colour table and LZW,
 * and both are short.
 *
 * The LZW code-width rule is the part everyone gets wrong, so there is a
 * round-trip check in make-wall-gif.mjs that decodes the output in a browser
 * and compares pixels, rather than trusting that it looks plausible.
 */

/** Accumulates codes of varying bit width into bytes, least significant first. */
class BitWriter {
  constructor() {
    this.bytes = [];
    this.cur = 0;
    this.n = 0;
  }

  write(code, len) {
    this.cur |= code << this.n;
    this.n += len;
    while (this.n >= 8) {
      this.bytes.push(this.cur & 0xff);
      this.cur >>>= 8;
      this.n -= 8;
    }
  }

  flush() {
    if (this.n > 0) {
      this.bytes.push(this.cur & 0xff);
      this.cur = 0;
      this.n = 0;
    }
  }
}

/**
 * GIF's variant of LZW.
 *
 * Codes below `clear` are the palette indices themselves. `clear` resets the
 * dictionary, `eoi` ends the stream. The width grows by one bit each time the
 * next code to be assigned no longer fits, and resets on a clear.
 *
 * @param {number} minCodeSize
 * @param {Uint8Array} indices
 * @returns {number[]}
 */
export function lzwEncode(minCodeSize, indices) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  const bw = new BitWriter();

  bw.write(clear, codeSize);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    bw.write(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next);
      next++;
      // Widen once the next code to assign would not fit in the current width.
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      bw.write(clear, codeSize);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }

  bw.write(prefix, codeSize);
  bw.write(eoi, codeSize);
  bw.flush();
  return bw.bytes;
}

/** GIF image data is carried in sub-blocks of at most 255 bytes. */
function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

/**
 * @typedef {object} GifFrame
 * @property {Uint8Array} indices One palette index per pixel, row-major.
 * @property {number} delayCs Frame delay in hundredths of a second.
 */

/**
 * @param {object} args
 * @param {number} args.width
 * @param {number} args.height
 * @param {number[][]} args.palette Up to 256 [r, g, b] entries.
 * @param {GifFrame[]} args.frames
 * @param {number} [args.loops] 0 means forever.
 * @returns {Buffer}
 */
export function encodeGif({ width, height, palette, frames, loops = 0 }) {
  if (palette.length > 256) throw new Error(`Palette has ${palette.length} entries, the maximum is 256.`);

  // The colour table must be a power of two, at least 2 entries.
  let bits = 1;
  while (1 << bits < palette.length) bits++;
  const tableSize = 1 << bits;

  const out = [];
  const push = (...b) => out.push(...b);
  const short = (v) => push(v & 0xff, (v >> 8) & 0xff);

  push(...Buffer.from('GIF89a', 'ascii'));

  // Logical screen descriptor: global colour table present, `bits` deep.
  short(width);
  short(height);
  push(0x80 | (bits - 1), 0, 0);

  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    push(c[0], c[1], c[2]);
  }

  // Netscape extension, the only way to say "loop".
  push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'ascii'), 3, 1, loops & 0xff, (loops >> 8) & 0xff, 0);

  const minCodeSize = Math.max(2, bits);
  for (const frame of frames) {
    // Graphic control extension: disposal 1 (leave in place), no transparency.
    push(0x21, 0xf9, 4, 0x04);
    short(frame.delayCs);
    push(0, 0);

    // Image descriptor: full frame, no local colour table, not interlaced.
    push(0x2c);
    short(0);
    short(0);
    short(width);
    short(height);
    push(0);

    push(minCodeSize);
    push(...subBlocks(lzwEncode(minCodeSize, frame.indices)));
  }

  push(0x3b);
  return Buffer.from(out);
}

/**
 * Build a palette from the frames and index every pixel against it.
 *
 * Anti-aliased text and circles produce a few hundred intermediate colours, so
 * the most frequent 256 are kept and anything else is matched to the nearest.
 * The match is cached per distinct colour, which keeps it to a few hundred
 * comparisons rather than one per pixel.
 *
 * @param {{data: Uint8ClampedArray}[]} canvases
 * @returns {{palette: number[][], indexed: Uint8Array[]}}
 */
export function quantise(canvases) {
  const counts = new Map();
  for (const c of canvases) {
    for (let i = 0; i < c.data.length; i += 4) {
      const key = (c.data[i] << 16) | (c.data[i + 1] << 8) | c.data[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const chosen = ranked.slice(0, 256).map(([key]) => key);
  const palette = chosen.map((key) => [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]);

  const lookup = new Map();
  chosen.forEach((key, i) => lookup.set(key, i));

  const nearest = (key) => {
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = palette[i][0] - r;
      const dg = palette[i][1] - g;
      const db = palette[i][2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const indexed = canvases.map((c) => {
    const px = new Uint8Array(c.data.length / 4);
    for (let i = 0, p = 0; i < c.data.length; i += 4, p++) {
      const key = (c.data[i] << 16) | (c.data[i + 1] << 8) | c.data[i + 2];
      let idx = lookup.get(key);
      if (idx === undefined) {
        idx = nearest(key);
        lookup.set(key, idx);
      }
      px[p] = idx;
    }
    return px;
  });

  return { palette, indexed, distinctColours: counts.size };
}
