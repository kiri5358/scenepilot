// Location helper: suggests which supported state a GPS point is in. Runs only on the phone.
// The coordinates are never sent to the server and are not stored.
//
// The state outlines below are COARSE hand-made shapes (a few dozen points each, errors of several kilometers).
// They are good enough to make a suggestion; the user always confirms, and near a border we say so instead of guessing.
// Only the demo states (Florida and New York) have outlines. Everything else is reported as "outside".
"use strict";

const Geo = (() => {
  // [longitude, latitude] pairs.
  const SHAPES = {
    FL: [
      // Florida: panhandle and peninsula
      [[-87.60, 31.00], [-85.00, 31.00], [-84.86, 30.71], [-82.21, 30.57], [-81.95, 30.80], [-81.45, 30.72],
       [-81.40, 30.28], [-81.30, 29.90], [-80.95, 29.10], [-80.58, 28.45], [-80.40, 27.80], [-80.15, 26.95],
       [-80.03, 26.55], [-80.05, 25.95], [-80.12, 25.76], [-80.30, 25.35], [-80.55, 25.10], [-80.90, 25.15],
       [-81.15, 25.13], [-81.38, 25.80], [-81.80, 26.12], [-81.95, 26.45], [-82.20, 26.85], [-82.55, 27.25],
       [-82.75, 27.65], [-82.85, 28.15], [-82.70, 28.90], [-83.05, 29.15], [-83.45, 29.65], [-83.75, 29.95],
       [-84.25, 30.05], [-84.60, 29.85], [-85.35, 29.68], [-85.72, 30.15], [-86.50, 30.38], [-87.00, 30.35],
       [-87.35, 30.32], [-87.60, 30.28]],
      // Florida Keys
      [[-80.20, 25.20], [-80.45, 25.28], [-81.00, 24.95], [-81.75, 24.60], [-82.00, 24.50], [-81.70, 24.45],
       [-80.95, 24.70], [-80.30, 25.00]],
    ],
    NY: [
      // New York: upstate, the Hudson Valley, the Bronx, Manhattan, Staten Island
      [[-79.76, 42.00], [-79.76, 42.27], [-78.90, 42.85], [-78.98, 43.08], [-79.05, 43.26], [-78.50, 43.37],
       [-77.60, 43.28], [-76.80, 43.30], [-76.50, 43.47], [-76.12, 43.95], [-76.33, 44.13], [-75.95, 44.30],
       [-75.50, 44.70], [-74.75, 45.00], [-73.35, 45.01], [-73.35, 44.50], [-73.40, 44.00], [-73.25, 43.50],
       [-73.27, 42.75], [-73.50, 42.05], [-73.55, 41.30], [-73.66, 41.00], [-73.78, 40.85], [-73.93, 40.80],
       [-74.01, 40.70], [-74.07, 40.64], [-74.25, 40.50], [-74.20, 40.64], [-74.02, 40.78], [-73.89, 41.00],
       [-74.69, 41.36], [-74.80, 41.44], [-75.05, 41.70], [-75.28, 41.92], [-75.36, 42.00]],
      // Long Island (Queens, Brooklyn, Nassau, Suffolk)
      [[-74.05, 40.62], [-73.92, 40.78], [-73.70, 40.84], [-73.43, 40.92], [-73.07, 40.96], [-72.65, 40.99],
       [-72.30, 41.14], [-71.85, 41.08], [-72.20, 40.90], [-72.70, 40.75], [-73.30, 40.62], [-73.82, 40.58],
       [-73.97, 40.57]],
    ],
  };

  // Padding on top of the GPS accuracy for the error in the coarse outlines above.
  const OUTLINE_ERROR_KM = 5;

  const KM_PER_DEG_LAT = 110.57;
  const KM_PER_DEG_LON_AT_EQUATOR = 111.32;

  // Equirectangular projection around a point: good enough at the scale of a state border.
  function project(lon, lat, lon0, lat0) {
    return [(lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * KM_PER_DEG_LON_AT_EQUATOR, (lat - lat0) * KM_PER_DEG_LAT];
  }

  function inside(lon, lat, ring) {
    let isIn = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) isIn = !isIn;
    }
    return isIn;
  }

  function distToSegmentKm(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToBoundaryKm(lon, lat, ring) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = project(ring[j][0], ring[j][1], lon, lat);
      const [bx, by] = project(ring[i][0], ring[i][1], lon, lat);
      best = Math.min(best, distToSegmentKm(0, 0, ax, ay, bx, by));
    }
    return best;
  }

  /**
   * Which supported state is this point in?
   * Returns { code, kind, distanceKm, marginKm }:
   *   kind "inside"  -> clearly inside the outline of `code`
   *   kind "outside" -> clearly outside every supported state (code is null)
   *   kind "near"    -> within the GPS accuracy plus the outline error of a border; `code` is the closest guess or null
   */
  function locate(lat, lon, accuracyM) {
    const marginKm = Math.max(Number(accuracyM) || 0, 1000) / 1000 + OUTLINE_ERROR_KM;
    let inCode = null;
    let nearest = { code: null, km: Infinity };
    for (const [code, rings] of Object.entries(SHAPES)) {
      for (const ring of rings) {
        const d = distToBoundaryKm(lon, lat, ring);
        if (inside(lon, lat, ring)) inCode = code;
        if (d < nearest.km) nearest = { code, km: d };
      }
    }
    if (inCode) {
      const d = Math.min(...SHAPES[inCode].map((ring) => (inside(lon, lat, ring) ? distToBoundaryKm(lon, lat, ring) : Infinity)));
      return { code: inCode, kind: d > marginKm ? "inside" : "near", distanceKm: d, marginKm };
    }
    return nearest.km > marginKm
      ? { code: null, kind: "outside", distanceKm: nearest.km, marginKm }
      : { code: nearest.code, kind: "near", distanceKm: nearest.km, marginKm };
  }

  // Test mode for people who are not in the United States: open the app with ?fakeloc=fl | ny | border | other | denied
  // to simulate a location. Nothing is sent anywhere; it only replaces what the browser would report.
  const FAKE = {
    fl: { lat: 28.54, lon: -81.38, accuracy: 25 },      // Orlando, Florida
    ny: { lat: 42.65, lon: -73.76, accuracy: 25 },      // Albany, New York
    border: { lat: 30.66, lon: -83.50, accuracy: 25 },  // near the Florida-Georgia line
    other: { lat: 33.75, lon: -84.39, accuracy: 25 },   // Atlanta, Georgia
  };
  const DENIED = "Location permission was denied. You can allow it in your browser settings, or choose the state yourself.";

  function fakeMode() {
    try {
      const mode = new URLSearchParams(window.location.search).get("fakeloc");
      return mode && (mode in FAKE || mode === "denied") ? mode : null;
    } catch {
      return null;
    }
  }

  /** Ask the phone for its position. Rejects with an Error whose message is safe to show the user. */
  function getPosition() {
    const fake = fakeMode();
    if (fake) {
      return new Promise((resolve, reject) => {
        setTimeout(() => (fake === "denied" ? reject(new Error(DENIED)) : resolve({ ...FAKE[fake] })), 400);
      });
    }
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) {
        reject(new Error("Location needs a secure (HTTPS) connection. Choose the state yourself."));
        return;
      }
      if (!("geolocation" in navigator)) {
        reject(new Error("This browser cannot share its location. Choose the state yourself."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => {
          const why = {
            1: DENIED,
            2: "Your phone could not work out where you are. Choose the state yourself.",
            3: "Finding your location took too long. Try again, or choose the state yourself.",
          }[err.code] || "Could not get your location. Choose the state yourself.";
          reject(new Error(why));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    });
  }

  return { locate, getPosition, fakeMode, SHAPES, OUTLINE_ERROR_KM };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Geo;
