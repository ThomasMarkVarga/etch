/**
 * The QR used in the wall preview and the social card.
 *
 * Indigo on white, with the Etch mark in the middle. Both of those are styling
 * choices the app itself warns about, so both are put through the app's own
 * checks here and the file is only written if they pass. A QR generator whose
 * marketing images carry a code that does not scan would be making exactly the
 * mistake it exists to prevent.
 *
 * Output: wall/qr-paths.json
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encode } from '../src/core/encode.js';
import { matrixToSvg } from '../src/core/render/matrixToSvg.js';
import { verify } from '../src/core/verify.js';
import { normaliseStyle, checkContrast, checkLogo, logoCeiling, contrastRatio } from '../src/core/style.js';

const here = dirname(fileURLToPath(import.meta.url));

export const URL_ENCODED = 'https://etch.vibe-coding.fans/';
export const INDIGO = '#4338CA';

/**
 * Error correction Q is what the app itself would choose for a logo this size:
 * the coverage is above what M can rebuild and inside what Q can. Picked by the
 * same rule rather than by eye.
 */
const ECC = 'Q';
const LOGO_RATIO = 0.2;
const LOGO_PADDING = 1;

export async function buildWallQr() {
  const result = encode(URL_ENCODED, { ecc: ECC, boostEcc: false });

  const { style } = normaliseStyle({
    foreground: INDIGO,
    background: '#FFFFFF',
    logo: {
      href: '',
      sizeRatio: LOGO_RATIO,
      padding: LOGO_PADDING,
      shape: 'square',
      plate: '#FFFFFF',
    },
  });

  const contrast = checkContrast(style);
  if (contrast.level === 'fail') throw new Error(`Indigo on white failed the contrast check: ${contrast.message}`);

  const logo = checkLogo(result.size, style.logo, ECC);
  if (!logo.ok) throw new Error(`The logo is too large: ${logo.message}`);

  // The real gate: does this exact styled code read back correctly?
  const check = await verify(result.matrix, result.version, URL_ENCODED, { style });
  if (!check.pass) {
    throw new Error(`The wall QR does not decode under: ${check.failedIds.join(', ')}. Shrink the logo or raise ECC.`);
  }

  // The pattern, without the logo: the logo is drawn as markup on top so the
  // preview needs no embedded raster.
  const svg = matrixToSvg(result.matrix, result.version, { style: { ...style, logo: null } });
  const paths = [...svg.svg.matchAll(/<path fill="[^"]*" fill-rule="evenodd" d="([^"]+)"/g)].map((m) => m[1]);

  const total = svg.totalModules;
  const plateModules = LOGO_RATIO * result.size + LOGO_PADDING * 2;
  const markModules = LOGO_RATIO * result.size;
  const centre = total / 2;

  const out = {
    url: URL_ENCODED,
    version: result.version,
    size: result.size,
    ecc: result.ecc,
    total,
    viewBox: `0 0 ${total} ${total}`,
    foreground: INDIGO,
    paths,
    logo: {
      ratio: LOGO_RATIO,
      plate: { x: centre - plateModules / 2, y: centre - plateModules / 2, size: plateModules },
      mark: { x: centre - markModules / 2, y: centre - markModules / 2, size: markModules },
      coverage: logo.coverage,
      ceiling: logoCeiling(ECC, result.size),
    },
    checks: {
      contrastRatio: Number(contrastRatio(INDIGO, '#FFFFFF').toFixed(2)),
      coveragePct: Number((logo.coverage * 100).toFixed(1)),
      ceilingPct: Number((logoCeiling(ECC, result.size) * 100).toFixed(1)),
      decoded: check.conditions.map((c) => ({ id: c.id, matched: c.matched })),
    },
  };

  await writeFile(join(here, '..', 'wall', 'qr-paths.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  return out;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const out = await buildWallQr();
  console.log(`version ${out.version}, ${out.size} modules, ECC ${out.ecc}, viewBox ${out.viewBox}`);
  console.log(`indigo on white ${out.checks.contrastRatio}:1`);
  console.log(`logo covers ${out.checks.coveragePct}% of ${out.checks.ceilingPct}% allowed`);
  console.log(`decoded: ${out.checks.decoded.map((d) => `${d.id} ${d.matched ? 'ok' : 'FAIL'}`).join(', ')}`);
}
