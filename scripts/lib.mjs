// Node-only helpers for the importers. Pure normalization lives in normalize.mjs.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export * from "./normalize.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function writeDataset(path, source, spots) {
  await mkdir(dirname(path), { recursive: true });
  const payload = { source, generatedAt: new Date().toISOString(), count: spots.length, spots };
  await writeFile(path, JSON.stringify(payload));
  console.log(`Wrote ${spots.length} spots -> ${path}`);
}
