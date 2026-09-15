/**
 * Verification, off the main thread.
 *
 * Decoding a dense code is on the order of a hundred milliseconds of solid
 * arithmetic per condition, and the single jsQR call inside each one cannot be
 * split, so no amount of yielding on the main thread gets the worst block under
 * about 150ms. In a worker it does not matter how long it takes: the page keeps
 * painting, the caret keeps blinking, and typing stays responsive.
 *
 * This is the reason src/core has no DOM dependency. It was written to run in
 * Node for the tests, and that same property is what lets it run here.
 *
 * The matrix arrives flattened as a Uint8Array rather than as an array of
 * arrays, because structured-cloning 177 nested arrays per keystroke is a cost
 * worth avoiding when a single flat buffer does the job.
 */

import { verify, findStyleCulprit } from './verify.js';

/**
 * @param {Uint8Array} flat
 * @param {number} size
 * @returns {boolean[][]}
 */
function unflatten(flat, size) {
  const matrix = new Array(size);
  for (let y = 0; y < size; y++) {
    const row = new Array(size);
    for (let x = 0; x < size; x++) row[x] = flat[y * size + x] === 1;
    matrix[y] = row;
  }
  return matrix;
}

self.onmessage = async (event) => {
  const { id, flat, size, version, expected, style, wantCulprit } = event.data ?? {};
  try {
    const matrix = unflatten(flat, size);
    const result = await verify(matrix, version, expected, { style });

    // Finding the culprit re-verifies up to five times. Only worth doing when
    // something actually failed, and only here, where it costs the page nothing.
    const culprit = !result.pass && wantCulprit ? await findStyleCulprit(matrix, version, expected, style) : null;

    self.postMessage({ id, ok: true, result, culprit });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
