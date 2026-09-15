/**
 * Which modules are structure and which are data.
 *
 * A scanner does not read a QR code left to right. It first locates the three
 * big corner squares (finder patterns), uses the alternating line between them
 * (the timing pattern) to work out the grid pitch, and uses the small squares
 * (alignment patterns) to correct for the page being tilted or curved. Those
 * modules are what make the code findable at all, so styling must not weaken
 * them the way it may safely weaken data modules.
 *
 * qrcodegen does not expose this classification, so it is derived here from the
 * version and size using the rules in ISO/IEC 18004.
 */

/**
 * Centre coordinates of alignment patterns for a version.
 * Ported from qrcodegen's getAlignmentPatternPositions.
 * @param {number} version
 * @returns {number[]}
 */
export function alignmentPatternPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/**
 * @typedef {'finder'|'separator'|'timing'|'alignment'|'format'|'version'|'dark'|'data'} ModuleRole
 */

/**
 * Role of every module in the grid.
 * @param {number} version
 * @returns {ModuleRole[][]} row-major, [y][x]
 */
export function classifyModules(version) {
  const size = version * 4 + 17;
  /** @type {ModuleRole[][]} */
  const roles = Array.from({ length: size }, () => new Array(size).fill('data'));

  const set = (x, y, role) => {
    if (x >= 0 && y >= 0 && x < size && y < size) roles[y][x] = role;
  };

  // Finder patterns and their separators, at three corners.
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = ox + dx;
        const y = oy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        set(x, y, inside ? 'finder' : 'separator');
      }
    }
  }

  // Timing patterns: row 6 and column 6, between the finders.
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, 'timing');
    set(6, i, 'timing');
  }

  // Alignment patterns: 5x5, skipping any that would collide with a finder.
  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const cx = positions[i];
      const cy = positions[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (roles[cy + dy][cx + dx] === 'data') set(cx + dx, cy + dy, 'alignment');
        }
      }
    }
  }

  // Format information, duplicated around two corners.
  for (let i = 0; i <= 8; i++) {
    if (roles[8][i] === 'data') set(i, 8, 'format');
    if (roles[i][8] === 'data') set(8, i, 'format');
  }
  for (let i = 0; i < 8; i++) {
    if (roles[8][size - 1 - i] === 'data') set(size - 1 - i, 8, 'format');
    if (roles[size - 1 - i][8] === 'data') set(8, size - 1 - i, 'format');
  }
  // The one module that is always dark, just above the bottom-left finder.
  set(8, size - 8, 'dark');

  // Version information blocks, for version 7 and up.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        set(size - 11 + j, i, 'version');
        set(i, size - 11 + j, 'version');
      }
    }
  }

  return roles;
}

/**
 * True where a module belongs to the structure a scanner locks onto, and so
 * should keep its full square area whatever module shape the user picked.
 * @param {ModuleRole} role
 * @returns {boolean}
 */
export function isStructural(role) {
  return role === 'finder' || role === 'separator' || role === 'timing' || role === 'alignment';
}

/**
 * The three finder patterns as boxes, in module coordinates.
 * @param {number} size
 * @returns {{x: number, y: number}[]}
 */
export function finderOrigins(size) {
  return [
    { x: 0, y: 0 },
    { x: size - 7, y: 0 },
    { x: 0, y: size - 7 },
  ];
}
