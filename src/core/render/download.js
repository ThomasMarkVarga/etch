/**
 * Turning a rendered code into a file on someone's disk.
 *
 * PNG is produced by drawing the exported SVG into a canvas rather than by
 * re-implementing the rendering. That guarantees the PNG and the SVG are the
 * same picture, including gradients, rounded squares and the logo, which two
 * separate renderers would eventually drift apart on.
 */

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next frame: revoking synchronously can cancel the download
  // in some browsers before it has started reading.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * @param {string} svg
 * @param {string} filename
 */
export function downloadSvg(svg, filename) {
  saveBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/**
 * Rasterise an SVG string at an exact pixel size.
 *
 * @param {string} svg
 * @param {number} pixels Width and height of the output.
 * @param {string} [background] Painted under the image, for transparent codes.
 * @returns {Promise<Blob>}
 */
export function svgToPngBlob(svg, pixels, background) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Same-origin data URL, so the canvas is never tainted and toBlob works.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixels;
      canvas.height = pixels;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('This browser would not give us a canvas to draw on.'));
        return;
      }
      // Nearest-neighbour: the source is vector and the target is an exact
      // multiple of the module grid, so smoothing would only soften edges that
      // are meant to be hard.
      ctx.imageSmoothingEnabled = false;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, pixels, pixels);
      }
      ctx.drawImage(img, 0, 0, pixels, pixels);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The image could not be written out as a PNG.'));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('The code could not be drawn for export.'));
    img.src = url;
  });
}

/**
 * Pixel sizes that land on a whole number of pixels per module.
 *
 * Asking for "1000px" when the code is 33 modules across gives 30.3 pixels per
 * module, and every module then straddles a pixel boundary and blurs. These
 * are the sizes near each target that divide exactly.
 *
 * @param {number} totalModules
 * @param {number[]} [targets]
 * @returns {{label: string, pixels: number, modulePx: number}[]}
 */
export function exactPngSizes(totalModules, targets = [512, 1024, 2048]) {
  const seen = new Set();
  const out = [];
  for (const target of targets) {
    const modulePx = Math.max(1, Math.round(target / totalModules));
    const pixels = modulePx * totalModules;
    if (seen.has(pixels)) continue;
    seen.add(pixels);
    out.push({ label: `${pixels} px`, pixels, modulePx });
  }
  return out;
}

/**
 * A filename that says what the file is without being opened.
 * @param {string} typeLabel
 * @param {string} ext
 */
export function filenameFor(typeLabel, ext, suffix = '') {
  const slug = typeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `etch-${slug}${suffix ? `-${suffix}` : ''}.${ext}`;
}
