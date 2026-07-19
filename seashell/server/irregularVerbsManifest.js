import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'irregular-verbs-manifest.json');

/** @type {Map<number, object> | null} */
let byId = null;

function loadManifest() {
  if (byId) return byId;
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const arr = JSON.parse(raw);
  byId = new Map(arr.map((v) => [Number(v.id), v]));
  return byId;
}

export function getIrregularVerbById(id) {
  const n = parseInt(String(id), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return loadManifest().get(n) ?? null;
}
