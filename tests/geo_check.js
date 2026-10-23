// Checks the coarse state outlines in src/scenepilot/static/geo.js against well-known places.
// Run by tests/test_geo_js.py with node. Exits non-zero on any failure.
"use strict";
const path = require("path");
const Geo = require(path.join(__dirname, "..", "src", "scenepilot", "static", "geo.js"));

const failures = [];
function check(name, got, want) {
  const ok = Object.entries(want).every(([k, v]) => (Array.isArray(v) ? v.includes(got[k]) : got[k] === v));
  if (!ok) failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

// Clearly inside (20 m GPS accuracy)
const FL = [["Orlando", 28.54, -81.38], ["Gainesville", 29.65, -82.32], ["Tallahassee", 30.44, -84.28], ["Lakeland", 28.04, -81.95]];
const NY = [["Albany", 42.65, -73.76], ["Syracuse", 43.05, -76.15], ["Utica", 43.10, -75.23], ["Poughkeepsie", 41.70, -73.93],
  ["Binghamton", 42.10, -75.91]];
for (const [n, lat, lon] of FL) check(n, Geo.locate(lat, lon, 20), { code: "FL", kind: "inside" });
for (const [n, lat, lon] of NY) check(n, Geo.locate(lat, lon, 20), { code: "NY", kind: "inside" });

// Island and coastal places: right state, but they sit close to an outline edge so "near" is fine
check("Key West", Geo.locate(24.56, -81.78, 20), { code: "FL", kind: ["inside", "near"] });
check("Hempstead (Long Island)", Geo.locate(40.71, -73.62, 20), { code: "NY", kind: ["inside", "near"] });
check("Miami", Geo.locate(25.76, -80.19, 20), { code: "FL", kind: ["inside", "near"] });
check("Pensacola", Geo.locate(30.42, -87.22, 20), { code: "FL", kind: ["inside", "near"] });

// Clearly outside both supported states
const OUT = [["Atlanta", 33.75, -84.39], ["Savannah", 32.08, -81.10], ["Mobile", 30.69, -88.04], ["Philadelphia", 39.95, -75.17],
  ["Boston", 42.36, -71.06], ["Burlington VT", 44.48, -73.21], ["Hartford", 41.76, -72.68], ["Scranton", 41.41, -75.66],
  ["Pittsburgh", 40.44, -80.00], ["Toronto", 43.65, -79.38], ["Atlantic Ocean", 28.0, -77.0], ["Los Angeles", 34.05, -118.24]];
for (const [n, lat, lon] of OUT) check(n, Geo.locate(lat, lon, 20), { code: null, kind: "outside" });

// Near a border: we must say so instead of guessing
check("Georgia line", Geo.locate(30.66, -83.50, 20), { code: "FL", kind: "near" });
check("Buffalo (Lake Erie and the Canadian border)", Geo.locate(42.89, -78.88, 20), { code: "NY", kind: "near" });
check("just inside NY at the PA line", Geo.locate(42.02, -76.0, 20), { code: "NY", kind: "near" });
check("just outside NY at the PA line", Geo.locate(41.98, -76.0, 20), { code: "NY", kind: "near" });
check("Orlando with an 80 km GPS error", Geo.locate(28.54, -81.38, 80000), { kind: "near" });
check("accuracy missing", Geo.locate(28.54, -81.38, undefined), { code: "FL", kind: "inside" });

// The margin grows with the reported GPS accuracy
const small = Geo.locate(28.54, -81.38, 20).marginKm;
const large = Geo.locate(28.54, -81.38, 8000).marginKm;
if (!(large > small)) failures.push(`margin should grow with accuracy: ${small} vs ${large}`);

// Every outline is a closed-enough ring with at least 3 points, in valid lon/lat ranges
for (const [code, rings] of Object.entries(Geo.SHAPES)) {
  for (const ring of rings) {
    if (ring.length < 3) failures.push(`${code}: ring too short`);
    for (const [lon, lat] of ring) if (lon < -180 || lon > 180 || lat < -90 || lat > 90) failures.push(`${code}: bad point ${lon},${lat}`);
  }
}

// Test mode for people outside the United States: ?fakeloc=fl | ny | border | other | denied
async function fakeModeChecks() {
  const setSearch = (search) => { global.window = { location: { search }, isSecureContext: false }; };

  setSearch("");
  if (Geo.fakeMode() !== null) failures.push("fakeMode should be off without the parameter");
  setSearch("?fakeloc=nonsense");
  if (Geo.fakeMode() !== null) failures.push("unknown fakeloc values must be ignored");

  const expected = { fl: ["FL", "inside"], ny: ["NY", "inside"], border: ["FL", "near"], other: [null, "outside"] };
  for (const [mode, [code, kind]] of Object.entries(expected)) {
    setSearch(`?fakeloc=${mode}`);
    if (Geo.fakeMode() !== mode) failures.push(`fakeMode should report ${mode}`);
    const pos = await Geo.getPosition(); // works even on an insecure page: it is a simulation
    check(`fakeloc=${mode}`, Geo.locate(pos.lat, pos.lon, pos.accuracy), { code, kind });
  }

  setSearch("?fakeloc=denied");
  try {
    await Geo.getPosition();
    failures.push("fakeloc=denied should reject");
  } catch (e) {
    if (!/permission was denied/i.test(e.message)) failures.push(`unexpected message: ${e.message}`);
  }

  // Without test mode an insecure page must refuse to ask for the location
  setSearch("");
  try {
    await Geo.getPosition();
    failures.push("an insecure page should reject");
  } catch (e) {
    if (!/secure \(HTTPS\)/.test(e.message)) failures.push(`unexpected message: ${e.message}`);
  }
}

fakeModeChecks().then(() => {
  if (failures.length) {
    console.error("FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("geo checks passed");
});
