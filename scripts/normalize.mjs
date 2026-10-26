// Pure helpers shared by the Node importers and the browser (no Node APIs here).
// Output shape must match src/types.ts `Spot`.

export const SPOT_TYPES = ["rvpark", "michinoeki", "campsite", "parking", "onsen", "dump", "other"];
export const SERVICES = ["power", "water", "toilet", "shower", "onsen", "wifi", "dump", "trash", "pets", "laundry"];

// Rough bounding box of Japan, used to reject garbage coordinates.
export function inJapan(lat, lng) {
  return lat > 20 && lat < 46.5 && lng > 122 && lng < 154.5;
}

// Japanese keyword -> service flag. Used on free text (scraped pages, descriptions).
const SERVICE_KEYWORDS = {
  power: [/電源/, /AC\s?100/i, /コンセント/, /electric/i, /power/i],
  water: [/給水/, /水道/, /飲料水/, /water/i],
  toilet: [/トイレ/, /toilet/i],
  shower: [/シャワー/, /shower/i],
  onsen: [/温泉/, /入浴/, /銭湯/, /浴場/, /onsen/i],
  wifi: [/wi-?fi/i, /無線LAN/],
  dump: [/ダンプ/, /汚水/, /排水処理/, /dump/i],
  trash: [/ゴミ/, /ごみ/, /廃棄/],
  pets: [/ペット/, /犬/, /pets?/i],
  laundry: [/ランドリー/, /洗濯/, /laundry/i],
};

export function servicesFromText(text) {
  const out = {};
  for (const [svc, patterns] of Object.entries(SERVICE_KEYWORDS)) {
    if (patterns.some((p) => p.test(text))) out[svc] = true;
  }
  return out;
}

export function typeFromText(text) {
  if (/RV\s?パーク|RV\s?park/i.test(text)) return "rvpark";
  if (/道の駅|michi[- ]?no[- ]?eki/i.test(text)) return "michinoeki";
  if (/オートキャンプ|キャンプ場|campground|camp ?site/i.test(text)) return "campsite";
  if (/温泉|銭湯|onsen/i.test(text)) return "onsen";
  if (/駐車場|パーキング|parking/i.test(text)) return "parking";
  return "other";
}

export function clean(s) {
  if (s == null) return undefined;
  const t = String(s).replace(/\s+/g, " ").trim();
  return t || undefined;
}
