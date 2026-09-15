/**
 * Talking to the verification worker, with a working fallback.
 *
 * The worker is the fast path and the one that keeps the page responsive. The
 * inline path exists because a worker can fail to start for reasons that have
 * nothing to do with this app: a strict Content Security Policy, a browser old
 * enough to lack module workers, a file:// origin. Falling back to running it
 * on the main thread is slower but correct, and a slow check beats no check.
 */

import { verify as verifyInline, findStyleCulprit as findCulpritInline } from './verify.js';

/** @type {Worker|null} */
let worker = null;
/** true once we have decided a worker is not available here. */
let workerUnavailable = false;

let nextId = 1;
/** @type {Map<number, {resolve: Function, reject: Function}>} */
const pending = new Map();

function getWorker() {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker !== 'function') {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./verify.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, ok, result, culprit, error } = event.data ?? {};
      const entry = pending.get(id);
      if (!entry) return; // a stale run whose caller has moved on
      pending.delete(id);
      if (ok) entry.resolve({ result, culprit });
      else entry.reject(new Error(error || 'The scan check failed inside the worker.'));
    };
    worker.onerror = () => {
      // Tear the worker down and let the next call run inline rather than
      // leaving every future verification hanging on a dead worker.
      for (const [, entry] of pending) entry.reject(new Error('The scan checker stopped unexpectedly.'));
      pending.clear();
      try {
        worker?.terminate();
      } catch {
        /* already gone */
      }
      worker = null;
      workerUnavailable = true;
    };
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/** Start the worker early, so the first check does not also pay to boot it. */
export function warmVerifier() {
  getWorker();
}

/**
 * @param {boolean[][]} matrix
 * @returns {{flat: Uint8Array, size: number}}
 */
function flatten(matrix) {
  const size = matrix.length;
  const flat = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = matrix[y];
    for (let x = 0; x < size; x++) flat[y * size + x] = row[x] ? 1 : 0;
  }
  return { flat, size };
}

/**
 * Verify a code and, when it fails, work out which styling choice is to blame.
 *
 * @param {object} args
 * @param {boolean[][]} args.matrix
 * @param {number} args.version
 * @param {string} args.expected
 * @param {import('./style.js').StyleSpec} args.style
 * @returns {Promise<{result: import('./verify.js').VerifyResult, culprit: object|null}>}
 */
export async function verifyAsync({ matrix, version, expected, style }) {
  const w = getWorker();

  if (!w) {
    const result = await verifyInline(matrix, version, expected, { style });
    const culprit = result.pass ? null : await findCulpritInline(matrix, version, expected, style);
    return { result, culprit };
  }

  const { flat, size } = flatten(matrix);
  const id = nextId++;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      // The buffer is transferred rather than copied: it was built for this
      // message and is not read again on this side.
      w.postMessage({ id, flat, size, version, expected, style, wantCulprit: true }, [flat.buffer]);
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err : new Error('Could not send the code to the scan checker.'));
    }
  });
}
