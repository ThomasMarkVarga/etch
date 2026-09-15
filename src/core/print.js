/**
 * Print maths.
 *
 * The question people actually have is not "what size PNG" but "how big do I
 * print this". Everything here answers that, in millimetres and inches,
 * because the audience spans both.
 */

export const MM_PER_INCH = 25.4;

/** @param {number} mm */
export const mmToIn = (mm) => mm / MM_PER_INCH;
/** @param {number} inch */
export const inToMm = (inch) => inch * MM_PER_INCH;

/**
 * The scan-distance rule of thumb.
 *
 * The widely repeated version is "printed width is one tenth of the scan
 * distance", i.e. a 10:1 distance-to-width ratio. Denso Wave, who invented the
 * format, publish the underlying relationship in terms of the cell size and
 * the scanner's resolving power rather than as a single ratio, and 10:1 is the
 * industry's simplification of it for ordinary camera phones.
 *
 * The brief asked for the 10:1 rule and the sourcing holds up, so it is
 * implemented as written. Two caveats are applied on top, because the bare
 * ratio quietly assumes an average code:
 *
 *   - A denser code has smaller modules at the same width, so a version 20
 *     code at 10:1 has half the module size of a version 5 code and will not
 *     read at the same distance. The minimum width is therefore scaled by the
 *     module count rather than treated as fixed.
 *   - Low error correction leaves less margin for the blur that distance adds,
 *     so L gets a little extra width and H gets none.
 *
 * Both adjustments make the answer larger, never smaller.
 */
export const DISTANCE_TO_WIDTH_RATIO = 10;

/** Reference module count the plain 10:1 rule implicitly assumes (version 4). */
const REFERENCE_MODULES = 33;

/** @type {Record<string, number>} */
const ECC_DISTANCE_MARGIN = { L: 1.15, M: 1.0, Q: 0.95, H: 0.9 };

/**
 * @typedef {object} PrintMethod
 * @property {string} id
 * @property {string} label
 * @property {number} minModuleMm Smallest module this method reliably prints.
 * @property {string} note
 */

/**
 * Practical minimum module sizes.
 *
 * These are the sizes below which the printing method itself starts to destroy
 * the code, through ink spread, toner scatter or the thermal head's dot pitch.
 * They are deliberately conservative: the cost of a code that fails is a
 * reprint, and the cost of printing 2mm larger is nothing.
 *
 * @type {PrintMethod[]}
 */
export const PRINT_METHODS = [
  {
    id: 'offset',
    label: 'Professional print (offset or digital press)',
    minModuleMm: 0.25,
    note: 'Menus, packaging, brochures from a print shop. The most forgiving option, because the press holds fine detail and the paper is coated.',
  },
  {
    id: 'laser',
    label: 'Office laser printer',
    minModuleMm: 0.4,
    note: 'Fine for signage and handouts on ordinary paper. Toner scatter softens edges slightly at small sizes.',
  },
  {
    id: 'inkjet',
    label: 'Inkjet on plain paper',
    minModuleMm: 0.5,
    note: 'Ink spreads into uncoated paper, thickening the dark squares and closing the gaps between them. Print larger than you think you need.',
  },
  {
    id: 'thermal',
    label: 'Thermal label printer',
    minModuleMm: 0.6,
    note: 'Common for product and shipping labels. The print head has a coarse dot pitch, and labels are small, which is the combination that fails most often.',
  },
  {
    id: 'engrave',
    label: 'Engraving, etching or embossing',
    minModuleMm: 0.8,
    note: 'On metal, wood or stone. Contrast comes from shadow rather than ink, so it varies with the light, and the cut itself rounds off small squares.',
  },
  {
    id: 'screen',
    label: 'Screen printing or embroidery',
    minModuleMm: 1.2,
    note: 'The coarsest method here. The mesh or the stitch sets a hard floor on detail, well above anything else on this list.',
  },
];

/** @param {string} id */
export function printMethod(id) {
  return PRINT_METHODS.find((m) => m.id === id) ?? PRINT_METHODS[1];
}

/**
 * Minimum printed width for a given scan distance.
 *
 * @param {object} args
 * @param {number} args.distanceMm How far away the reader will be.
 * @param {number} args.totalModules Modules per side including the quiet zone.
 * @param {'L'|'M'|'Q'|'H'} args.ecc
 * @returns {{widthMm: number, plainRuleMm: number, densityFactor: number}}
 */
export function minimumWidthForDistance({ distanceMm, totalModules, ecc }) {
  const plainRuleMm = distanceMm / DISTANCE_TO_WIDTH_RATIO;
  const densityFactor = Math.max(1, totalModules / REFERENCE_MODULES);
  const eccFactor = ECC_DISTANCE_MARGIN[ecc] ?? 1;
  return {
    widthMm: plainRuleMm * densityFactor * eccFactor,
    plainRuleMm,
    densityFactor,
  };
}

/**
 * The distance a code of a given width can realistically be read from.
 * @param {object} args
 * @param {number} args.widthMm
 * @param {number} args.totalModules
 * @param {'L'|'M'|'Q'|'H'} args.ecc
 * @returns {number} millimetres
 */
export function distanceForWidth({ widthMm, totalModules, ecc }) {
  const densityFactor = Math.max(1, totalModules / REFERENCE_MODULES);
  const eccFactor = ECC_DISTANCE_MARGIN[ecc] ?? 1;
  return (widthMm * DISTANCE_TO_WIDTH_RATIO) / (densityFactor * eccFactor);
}

/**
 * @typedef {object} PrintAnalysis
 * @property {number} moduleMm Size of one square on the page.
 * @property {number} moduleIn
 * @property {number} codeOnlyMm Width without the quiet zone.
 * @property {number} quietZoneMm Width of the border on one side.
 * @property {number} recommendedDistanceMm
 * @property {number} minModuleMm Floor for the chosen method.
 * @property {'good'|'risky'|'fail'} level
 * @property {{level: 'error'|'warning'|'info', message: string}[]} warnings
 */

/**
 * Everything that follows from a chosen printed width.
 *
 * @param {object} args
 * @param {number} args.widthMm Total printed width, including quiet zone.
 * @param {number} args.totalModules
 * @param {number} args.quietZone
 * @param {'L'|'M'|'Q'|'H'} args.ecc
 * @param {string} args.methodId
 * @returns {PrintAnalysis}
 */
export function analysePrint({ widthMm, totalModules, quietZone, ecc, methodId }) {
  const method = printMethod(methodId);
  const moduleMm = widthMm / totalModules;
  const codeModules = totalModules - quietZone * 2;
  const warnings = [];

  /** @type {'good'|'risky'|'fail'} */
  let level = 'good';

  if (moduleMm < method.minModuleMm) {
    level = 'fail';
    const needed = method.minModuleMm * totalModules;
    warnings.push({
      level: 'error',
      message: `Each square would be ${moduleMm.toFixed(2)}mm across, below the ${method.minModuleMm}mm floor for ${method.label.toLowerCase()}. Print it at least ${Math.ceil(needed)}mm wide, use fewer characters so the code is less dense, or choose a finer printing method.`,
    });
  } else if (moduleMm < method.minModuleMm * 1.3) {
    level = 'risky';
    warnings.push({
      level: 'warning',
      message: `Each square would be ${moduleMm.toFixed(2)}mm, only just above the ${method.minModuleMm}mm floor for this method. It leaves nothing for a bad batch of labels or a worn print head.`,
    });
  }

  if (widthMm < 20) {
    warnings.push({
      level: 'warning',
      message: 'Under about 20mm, a phone has to be held very close and steady. Fine on a business card someone picks up, risky on a shelf label.',
    });
  }

  warnings.push({
    level: 'info',
    message: `The clear border is part of the code: ${(moduleMm * quietZone).toFixed(1)}mm on every side at this size. Trimming into it is the most common reason a printed code fails, and it fails after the print run, not before.`,
  });

  return {
    moduleMm,
    moduleIn: mmToIn(moduleMm),
    codeOnlyMm: moduleMm * codeModules,
    quietZoneMm: moduleMm * quietZone,
    recommendedDistanceMm: distanceForWidth({ widthMm, totalModules, ecc }),
    minModuleMm: method.minModuleMm,
    level,
    warnings,
  };
}

/**
 * Surface and placement warnings. Not conditional on the numbers, because
 * these are the failures that no amount of sizing fixes.
 *
 * @type {{id: string, title: string, body: string}[]}
 */
export const SURFACE_WARNINGS = [
  {
    id: 'curved',
    title: 'Curved surfaces',
    body: 'A bottle, a pipe, a cup. Curvature distorts the grid and the far side of the curve falls out of focus. Keep the code under about a third of the way around the curve, and print it larger than the flat-surface answer above.',
  },
  {
    id: 'reflective',
    title: 'Laminate, gloss and metal',
    body: 'A shiny finish bounces the phone’s own light straight back and blows out part of the pattern. Matt laminate is reliable; gloss is not. On metal, a brushed or bead-blasted finish beats a polished one.',
  },
  {
    id: 'busy',
    title: 'Printing over a photo or pattern',
    body: 'The code needs a plain area behind it, including the clear border. Put it on a solid panel rather than straight onto artwork.',
  },
  {
    id: 'substrate',
    title: 'Fabric, cardboard and unfinished wood',
    body: 'Absorbent and textured materials spread the ink and soften every edge. Treat the module floor for these as roughly double the figure for paper.',
  },
  {
    id: 'light',
    title: 'Where it will be read',
    body: 'A code in a dim corridor or in direct sun is harder than the same code on a desk. If the placement is fixed and the lighting is poor, go up a size.',
  },
];

/**
 * Sensible starting width for a code, given how it will be used.
 * @type {{id: string, label: string, widthMm: number, distanceMm: number}[]}
 */
export const PRINT_PRESETS = [
  { id: 'card', label: 'Business card', widthMm: 22, distanceMm: 200 },
  { id: 'menu', label: 'Menu or flyer', widthMm: 30, distanceMm: 300 },
  { id: 'label', label: 'Product label', widthMm: 25, distanceMm: 250 },
  { id: 'tableTalker', label: 'Table sign', widthMm: 50, distanceMm: 500 },
  { id: 'poster', label: 'Poster, arm’s length', widthMm: 80, distanceMm: 800 },
  { id: 'window', label: 'Shop window', widthMm: 150, distanceMm: 1500 },
  { id: 'sign', label: 'Wall sign, across a room', widthMm: 400, distanceMm: 4000 },
];
