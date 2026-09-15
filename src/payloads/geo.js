/**
 * Geographic point, as a geo: URI (RFC 5870).
 *
 * Useful on a gate, a trailhead sign, a site entrance, or a grave marker:
 * somewhere a street address does not exist or does not help.
 */

/** @param {number} n @param {number} places */
function trim(n, places) {
  return String(Number(n.toFixed(places)));
}

/**
 * @param {{latitude: number|string, longitude: number|string, altitude?: number|string, label?: string}} input
 * @returns {string}
 */
export function buildGeo(input) {
  const lat = Number(input.latitude);
  const lon = Number(input.longitude);
  // Six decimal places is about 11 cm. More is noise and only makes the code
  // denser, so it is dropped rather than encoded.
  let out = `geo:${trim(lat, 6)},${trim(lon, 6)}`;
  if (input.altitude !== undefined && input.altitude !== '' && Number.isFinite(Number(input.altitude))) {
    out += `,${trim(Number(input.altitude), 1)}`;
  }
  return out;
}

/** @param {{latitude: number|string, longitude: number|string}} input */
export function validateGeo(input) {
  const out = [];
  const lat = Number(input.latitude);
  const lon = Number(input.longitude);
  if (input.latitude === '' || input.latitude === undefined || !Number.isFinite(lat)) {
    out.push({ field: 'latitude', level: 'error', message: 'Enter a latitude, as a decimal number like 44.4268.' });
  } else if (lat < -90 || lat > 90) {
    out.push({ field: 'latitude', level: 'error', message: 'Latitude runs from -90 to 90.' });
  }
  if (input.longitude === '' || input.longitude === undefined || !Number.isFinite(lon)) {
    out.push({ field: 'longitude', level: 'error', message: 'Enter a longitude, as a decimal number like 26.1025.' });
  } else if (lon < -180 || lon > 180) {
    out.push({ field: 'longitude', level: 'error', message: 'Longitude runs from -180 to 180.' });
  }
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat === 0 && lon === 0) {
    out.push({ field: 'latitude', level: 'warning', message: 'Zero, zero is a point in the Atlantic Ocean. That is usually a sign the coordinates did not get filled in.' });
  }
  return out;
}

export const GEO_EXAMPLE = { latitude: '44.426800', longitude: '26.102500', label: 'Bucharest' };

export const GEO_SUPPORT =
  'Android opens geo: links in the default maps app. iOS does not register a handler for geo:, so an iPhone camera shows the coordinates as text rather than opening Maps. If the audience is mixed, printing the coordinates next to the code is worth the ink.';
