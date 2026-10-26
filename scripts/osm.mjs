// OpenStreetMap query + normalization, shared by scripts/fetch-osm.mjs (all of Japan)
// and the browser's live loading (src/live.ts, one map area at a time).
import { SERVICES, clean, inJapan, servicesFromText } from "./normalize.mjs";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const FILTERS = [
  '["tourism"="caravan_site"]',
  '["tourism"="camp_site"]',
  // Michi-no-Eki and expressway SA/PA. Matched by tag, never by name: a name regex makes Overpass
  // scan every named object in the box, which times out around big cities.
  '["highway"="services"]',
  '["highway"="rest_area"]',
  '["amenity"="parking"]["motorhome"~"yes|designated"]',
  '["amenity"="sanitary_dump_station"]',
  '["amenity"="public_bath"]',
];

/** `bbox` = [south, west, north, east]; omit it for all of Japan. */
export function overpassQuery(bbox, timeout = 600) {
  const scope = bbox ? bbox.map((n) => n.toFixed(4)).join(",") : "area.jp";
  const head = bbox ? "" : 'area["ISO3166-1"="JP"][admin_level=2]->.jp;\n';
  return `[out:json][timeout:${timeout}];\n${head}(\n${FILTERS.map((f) => `  nwr${f}(${scope});`).join("\n")}\n);\nout center tags;`;
}

const yes = (v) => v != null && v !== "no" && v !== "none";

function classify(t) {
  const name = t.name ?? "";
  if (/RVパーク/i.test(name)) return "rvpark";
  if (/^道の駅/.test(name)) return "michinoeki";
  if (t.tourism === "caravan_site") return "rvpark";
  if (t.tourism === "camp_site") return "campsite";
  if (t.amenity === "parking") return "parking";
  // Expressway service/parking areas (SA/PA): overnight rest there is common and tolerated.
  if (t.highway === "services" || t.highway === "rest_area") return "parking";
  if (t.amenity === "public_bath") return "onsen";
  if (t.amenity === "sanitary_dump_station") return "dump";
  return "other";
}

function services(t, type) {
  const s = {};
  if (yes(t.power_supply) || yes(t["power_supply:motorhome"])) s.power = true;
  if (yes(t.drinking_water) || yes(t.water_point)) s.water = true;
  if (yes(t.toilets)) s.toilet = true;
  if (yes(t.shower) || yes(t.showers)) s.shower = true;
  if (yes(t.sanitary_dump_station) || type === "dump") s.dump = true;
  if (yes(t.internet_access)) s.wifi = true;
  if (yes(t.dog) || yes(t.pets)) s.pets = true;
  if (yes(t.waste_disposal)) s.trash = true;
  if (yes(t.laundry) || yes(t.washing_machine)) s.laundry = true;
  if (type === "onsen") s.onsen = true;
  // Michi-no-Eki are required to have 24h toilets and parking.
  if (type === "michinoeki") s.toilet = true;
  // Pick up anything mentioned in free-text tags too.
  Object.assign(s, servicesFromText([t.description, t.note].filter(Boolean).join(" ")));
  return Object.fromEntries(Object.entries(s).filter(([k]) => SERVICES.includes(k)));
}

function address(t) {
  if (t["addr:full"]) return t["addr:full"];
  const parts = [t["addr:province"], t["addr:city"], t["addr:quarter"], t["addr:neighbourhood"], t["addr:block_number"] ?? t["addr:housenumber"]];
  return clean(parts.filter(Boolean).join(""));
}

function price(t) {
  if (t.charge) return t.charge;
  if (t.fee === "no") return "Free";
  if (t.fee === "yes") return "Paid";
  return undefined;
}

function defaultName(type) {
  return { rvpark: "RV park", campsite: "Campsite", parking: "Motorhome parking", dump: "Dump station" }[type] ?? "Spot";
}

/** Turns Overpass `elements` into Spot objects. */
export function normalizeOsm(elements) {
  const spots = [];
  const michiByName = new Map();
  for (const el of elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !inJapan(lat, lng)) continue;
    const type = classify(t);
    // Unnamed bathhouses and rest areas are noise (lay-bys, tiny pull-offs).
    if (!t.name && (type === "onsen" || type === "other" || t.highway)) continue;

    const spot = {
      id: `osm:${el.type}/${el.id}`,
      source: "osm",
      name: clean(t.name ?? t["name:en"]) ?? defaultName(type),
      nameEn: clean(t["name:en"]),
      lat,
      lng,
      type,
      services: services(t, type),
      price: clean(price(t)),
      opening: clean(t.opening_hours),
      address: address(t),
      phone: clean(t.phone ?? t["contact:phone"]),
      url: clean(t.website ?? t["contact:website"] ?? t.url),
      description: clean(t.description),
      capacity: clean(t.capacity),
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    };

    // Many shops/toilets inside a Michi-no-Eki also carry its name: keep one per name,
    // preferring the area (way/relation) or the services/rest_area node.
    if (type === "michinoeki") {
      const key = t.name.replace(/\s+/g, "");
      const rank = el.type !== "node" ? 3 : /services|rest_area/.test(t.highway ?? "") ? 2 : t.shop || t.amenity === "toilets" ? 0 : 1;
      const prev = michiByName.get(key);
      if (!prev || rank > prev.rank) {
        if (prev) Object.assign(spot.services, prev.spot.services);
        michiByName.set(key, { rank, spot });
      } else Object.assign(prev.spot.services, spot.services);
      continue;
    }
    spots.push(spot);
  }
  return spots.concat([...michiByName.values()].map((v) => v.spot));
}
