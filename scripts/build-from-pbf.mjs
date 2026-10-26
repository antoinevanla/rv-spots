#!/usr/bin/env node
// Builds the spot dataset from a Geofabrik extract instead of the (often overloaded) Overpass API.
// Input is the GeoJSON-seq that osmium writes; see the rv-spots repo's update-data workflow:
//
//   osmium tags-filter japan-latest.osm.pbf nwr/tourism=caravan_site,camp_site ... -o spots.osm.pbf
//   osmium export spots.osm.pbf -f geojsonseq -x print_record_separator=false -a type,id -o spots.geojsonseq
//   node scripts/build-from-pbf.mjs spots.geojsonseq --out data/osm.json --min 2000
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { writeDataset } from "./lib.mjs";
import { normalizeOsm } from "./osm.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const INPUT = args[0]?.startsWith("--") ? undefined : args[0];
const OUT = arg("out", "public/data/osm.json");
const MIN_SPOTS = Number(arg("min", "0"));
if (!INPUT) {
  console.error("Usage: build-from-pbf.mjs <spots.geojsonseq> [--out file] [--min n]");
  process.exit(1);
}

// Average of the outer ring's points: close enough to place a pin on a campsite or rest area.
function center(geometry) {
  const { type, coordinates: c } = geometry;
  const ring =
    type === "Point" ? [c] : type === "LineString" ? c : type === "Polygon" ? c[0] : type === "MultiPolygon" ? c[0][0] : null;
  if (!ring?.length) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lat: lat / ring.length, lon: lng / ring.length };
}

const elements = [];
const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
for await (const raw of rl) {
  const line = raw.replace(/^\x1e/, "").trim(); // tolerate RS separators
  if (!line) continue;
  const f = JSON.parse(line);
  const pos = f.geometry && center(f.geometry);
  if (!pos) continue;
  const { "@type": type = "node", "@id": id, ...tags } = f.properties ?? {};
  elements.push({ type, id, lat: pos.lat, lon: pos.lon, tags });
}
console.log(`Read ${elements.length} features`);

const spots = normalizeOsm(elements);
const counts = spots.reduce((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + 1), acc), {});
console.log("By type:", counts);
if (spots.length < MIN_SPOTS) {
  console.error(`Only ${spots.length} spots (expected at least ${MIN_SPOTS}); not writing.`);
  process.exit(1);
}
await writeDataset(OUT, "osm", spots);
