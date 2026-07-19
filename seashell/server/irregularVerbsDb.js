import { IRREGULAR_VERB_EXAMPLES_PER_FORM } from './dictionaryConstants.js';
import { getDbPool } from './db.js';
import { englishLineFromItem, russianLineFromItem } from './exampleFields.js';
import { formatExampleTranslationForLocale } from './stylisticNotes.js';
import { normalizeContentLocale } from './promptLocales.js';

const pool = getDbPool();
const FORM_KEYS = ['present', 'past_simple', 'past_participle'];

function normalizeEnKey(en) {
  return String(en ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeStoredExample(item) {
  if (!item || typeof item !== 'object') return null;
  const form = String(item.form ?? '').trim();
  if (!FORM_KEYS.includes(form)) return null;
  const en = englishLineFromItem(item);
  const translation = russianLineFromItem(item);
  if (!en) return null;
  return { form, en, translation: translation || '' };
}

function examplesFromPayload(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const arr = Array.isArray(raw.examples) ? raw.examples : Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of arr) {
    const ex = normalizeStoredExample(item);
    if (ex) out.push(ex);
  }
  return out;
}

function poolExamplesByForm(allExamples) {
  const pools = {
    present: new Map(),
    past_simple: new Map(),
    past_participle: new Map(),
  };
  for (const ex of allExamples) {
    const key = normalizeEnKey(ex.en);
    if (!key) continue;
    const bucket = pools[ex.form];
    if (!bucket.has(key)) bucket.set(key, ex);
  }
  return pools;
}

function pickMixedExamples(pools, contentLocale) {
  const mixed = [];
  const counts = {};
  for (const form of FORM_KEYS) {
    const unique = [...pools[form].values()];
    shuffleInPlace(unique);
    const picked = unique.slice(0, IRREGULAR_VERB_EXAMPLES_PER_FORM);
    counts[form] = picked.length;
    mixed.push(...picked);
  }
  const needsGeneration = FORM_KEYS.some(
    (form) => counts[form] < IRREGULAR_VERB_EXAMPLES_PER_FORM,
  );
  const locale = normalizeContentLocale(contentLocale);
  const examples = mixed.map((ex) => ({
    ...ex,
    translation: formatExampleTranslationForLocale(ex.translation, locale),
  }));
  return { examples, counts, needsGeneration };
}

export async function listIrregularVerbExampleBatches(verbId, contentLocale) {
  const id = parseInt(String(verbId), 10);
  const locale = normalizeContentLocale(contentLocale);
  if (!Number.isFinite(id) || id <= 0) return [];
  const { rows } = await pool.query(
    `SELECT payload FROM irregular_verb_example_batches
     WHERE verb_id = $1 AND content_locale = $2
     ORDER BY created_at ASC`,
    [id, locale],
  );
  return rows.map((row) => examplesFromPayload(row.payload)).flat();
}

export async function getMixedIrregularVerbExamples(verbId, contentLocale) {
  const all = await listIrregularVerbExampleBatches(verbId, contentLocale);
  const pools = poolExamplesByForm(all);
  return pickMixedExamples(pools, contentLocale);
}

export async function appendIrregularVerbExampleBatch(verbId, contentLocale, examples) {
  const id = parseInt(String(verbId), 10);
  const locale = normalizeContentLocale(contentLocale);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid verb id');
  }
  const normalized = examples.map((item) => normalizeStoredExample(item)).filter(Boolean);
  if (!normalized.length) {
    throw new Error('Empty examples batch');
  }
  const now = Date.now();
  await pool.query(
    `INSERT INTO irregular_verb_example_batches (verb_id, content_locale, payload, created_at)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [id, locale, JSON.stringify({ examples: normalized }), now],
  );
  return getMixedIrregularVerbExamples(id, locale);
}

export async function irregularVerbBatchCount(verbId, contentLocale) {
  const id = parseInt(String(verbId), 10);
  const locale = normalizeContentLocale(contentLocale);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM irregular_verb_example_batches
     WHERE verb_id = $1 AND content_locale = $2`,
    [id, locale],
  );
  return rows[0]?.c ?? 0;
}
