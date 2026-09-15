/**
 * Reading a QR code out of an image the user supplies.
 *
 * Browser only: this is the one place the app touches a canvas, because the
 * input is a real photo rather than something generated here.
 *
 * Photos are harder than generated images, so a failed first pass is retried
 * at a couple of scales and with a contrast stretch before giving up. That is
 * ordinary image handling, not inference: there is no model anywhere in this.
 */

import jsQR from 'jsqr';

/** Longest edge to work at. Bigger is slower with no accuracy gain. */
const MAX_EDGE = 1400;

/**
 * @param {Blob|File} file
 * @returns {Promise<ImageData>}
 */
async function toImageData(file, maxEdge = MAX_EDGE) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser would not provide a canvas to read the image with.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Stretch contrast so a washed-out photo has a fighting chance.
 * @param {ImageData} img
 * @returns {ImageData}
 */
function stretchContrast(img) {
  const data = new Uint8ClampedArray(img.data);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const v = ((lum - min) / range) * 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  return { data, width: img.width, height: img.height };
}

/**
 * @typedef {object} DecodeOutcome
 * @property {boolean} ok
 * @property {string|null} text
 * @property {string|null} reason
 * @property {{width: number, height: number}} [size]
 * @property {string} [how] Which attempt succeeded.
 */

/**
 * @param {Blob|File} file
 * @returns {Promise<DecodeOutcome>}
 */
export async function decodeImageFile(file) {
  if (!file.type.startsWith('image/')) {
    return { ok: false, text: null, reason: 'That is not an image file. Use a photo or a screenshot of the code.' };
  }

  let base;
  try {
    base = await toImageData(file);
  } catch {
    return { ok: false, text: null, reason: 'That image could not be opened. It may be damaged, or in a format this browser does not read.' };
  }

  const attempts = [
    { how: 'the image as supplied', img: base },
    { how: 'with the contrast stretched', img: stretchContrast(base) },
  ];

  for (const attempt of attempts) {
    for (const inversion of /** @type {const} */ (['dontInvert', 'attemptBoth'])) {
      const found = jsQR(attempt.img.data, attempt.img.width, attempt.img.height, { inversionAttempts: inversion });
      if (found?.data) {
        return {
          ok: true,
          text: found.data,
          reason: null,
          size: { width: base.width, height: base.height },
          how: attempt.how,
        };
      }
    }
  }

  // One more go at a smaller size: a very large photo of a small code sometimes
  // reads better once the noise has been averaged away by downscaling.
  try {
    const small = await toImageData(file, 700);
    const found = jsQR(small.data, small.width, small.height, { inversionAttempts: 'attemptBoth' });
    if (found?.data) {
      return { ok: true, text: found.data, reason: null, size: { width: small.width, height: small.height }, how: 'after scaling the image down' };
    }
  } catch {
    /* fall through to the failure message */
  }

  return {
    ok: false,
    text: null,
    reason:
      'No QR code could be read in that image. Crop closer to the code, make sure the whole pattern and its white border are in frame, and avoid glare across the surface.',
  };
}
