#!/usr/bin/env node
// Downloads RV parks, Michi-no-Eki, SA/PA, campsites, motorhome parking, onsen and dump stations
// for all of Japan from OpenStreetMap (Overpass API) into public/data/osm.json.
// The hosted app gets this file from a weekly GitHub Action; without it the app loads live per area.
//
//   npm run fetch:osm
//   npm run fetch:osm -- --endpoint https://overpass.kumi.systems/api/interpreter --out data/osm.json
import { sleep, writeDataset } from "./lib.mjs";
import { OVERPASS_ENDPOINTS, normalizeOsm, overpassQuery } from "./osm.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const endpoints = arg("endpoint") ? [arg("endpoint")] : OVERPASS_ENDPOINTS;
const OUT = arg("out", "public/data/osm.json");
const MIN_SPOTS = Number(arg("min", "0")); // refuse to write a suspiciously small result

async function query(endpoint) {
  console.log(`Querying ${endpoint} (this can take 1-3 minutes)...`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "rv-spots-personal/0.1" },
    body: new URLSearchParams({ data: overpassQuery() }),
    signal: AbortSignal.timeout(11 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
  return json.elements;
}

let elements;
for (const [i, endpoint] of endpoints.entries()) {
  try {
    elements = await query(endpoint);
    break;
  } catch (e) {
    console.error(`  failed: ${e.message}`);
    if (i < endpoints.length - 1) await sleep(5000);
  }
}
if (!elements) {
  console.error("All Overpass servers failed.");
  process.exit(1);
}

const spots = normalizeOsm(elements);
const counts = spots.reduce((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + 1), acc), {});
console.log("By type:", counts);
if (spots.length < MIN_SPOTS) {
  console.error(`Only ${spots.length} spots (expected at least ${MIN_SPOTS}); not writing.`);
  process.exit(1);
}
await writeDataset(OUT, "osm", spots);
