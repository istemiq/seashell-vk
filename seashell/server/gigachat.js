/**
 * Клиент GigaChat OAuth + chat/completions.
 * Промпты лежат в `server/prompts/`. Ответы парсятся в JSON (примеры словаря, ход диалога практики).
 * Исходящие HTTPS-запросы идут через `undici` с опциональным ослаблением TLS (см. tlsInsecure).
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { Agent, fetch as undiciFetch } from 'undici';
import {
  englishLineFromItem,
  lineFromField,
  russianLineFromItem,
  stylisticNoteFromItem,
  splitTranslationTail,
  normalizeVerbUsage,
} from './exampleFields.js';
import { WORD_EXAMPLE_COUNT } from './dictionaryConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, 'prompts');

const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

/** Встроенный `fetch` в Node 24 может игнорировать `dispatcher` — весь GigaChat идёт через undici. */
let insecureDispatcher = null;

/**
 * Ослабить проверку TLS для исходящих запросов к GigaChat.
 * Явно: GIGACHAT_TLS_INSECURE=1 / =0 в server/.env.
 * По умолчанию: если NODE_ENV !== 'production' (типичный npm run dev) — включаем (антивирус Windows часто даёт self-signed chain).
 * На проде с NODE_ENV=production — строго, пока не задашь =1.
 */
export function tlsInsecure() {
  const v = process.env.GIGACHAT_TLS_INSECURE?.trim();
  if (v === '0' || v?.toLowerCase() === 'false') return false;
  if (v === '1' || v?.toLowerCase() === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}
function gigaFetch(url, init = {}) {
  const timeouts = {
    headersTimeout: 20_000,
    bodyTimeout: 25_000,
  };
  if (tlsInsecure()) {
    if (!insecureDispatcher) {
      insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
    return undiciFetch(url, { ...timeouts, ...init, dispatcher: insecureDispatcher });
  }
  return undiciFetch(url, { ...timeouts, ...init });
}

let cached = { token: null, expiresAt: 0 };

/** Node даёт сухое «fetch failed» — подменяем на подсказку для .env и TLS. */
function mapNetErr(err, phase) {
  const raw = String(err?.cause?.message || err?.message || err);
  const low = raw.toLowerCase();
  const looksNet =
    low.includes('fetch failed') ||
    low.includes('econn') ||
    low.includes('enotfound') ||
    low.includes('etimedout') ||
    low.includes('certificate') ||
    low.includes('tls') ||
    low.includes('ssl') ||
    low.includes('self-signed');
  if (!looksNet) return err instanceof Error ? err : new Error(raw);
  return new Error(
    `GigaChat (${phase}): сеть/HTTPS. Проверь интернет и VPN. Локально при NODE_ENV=production задай в server/.env GIGACHAT_TLS_INSECURE=1. Технически: ${raw}`
  );
}

async function getAccessToken() {
  const now = Date.now();
  if (cached.token && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  // В .env легко случайно оставить перенос/пробел, кавычки или даже префикс "Basic ".
  // GigaChat OAuth очень чувствителен к таким артефактам и отвечает "Can't decode Authorization header".
  const key = String(process.env.GIGACHAT_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^basic\s+/i, '')
    .replace(/\s+/g, '');
  if (!key) {
    throw new Error('GIGACHAT_API_KEY is not set');
  }

  const rqUid = randomUUID();
  const body = new URLSearchParams({ scope: 'GIGACHAT_API_PERS' });

  let res;
  try {
    res = await gigaFetch(OAUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: rqUid,
        Authorization: `Basic ${key}`,
      },
      body: body.toString(),
    });
  } catch (e) {
    throw mapNetErr(e, 'OAuth');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GigaChat OAuth: ${res.status} ${JSON.stringify(data)}`);
  }

  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in) || 1700;
  cached = {
    token: accessToken,
    expiresAt: now + expiresIn * 1000,
  };
  return accessToken;
}

/**
 * Словарный промпт читается с диска на каждый запрос (без in-memory кэша),
 * чтобы правки в `prompts/*` применялись без перезапуска процесса.
 */
function getWordDictionaryUserPromptParts() {
  return {
    template: fs.readFileSync(path.join(PROMPTS_DIR, 'word-examples.txt'), 'utf8'),
    formatSample: fs.readFileSync(
      path.join(PROMPTS_DIR, 'word-dictionary-format-sample.json'),
      'utf8',
    ),
    formatSampleVerb: fs.readFileSync(
      path.join(PROMPTS_DIR, 'word-dictionary-format-sample-verb.json'),
      'utf8',
    ),
  };
}

/** System-роль GigaChat для словаря: `prompts/word-dictionary-system.txt`. */
function buildDictionarySystemContent() {
  const raw = fs.readFileSync(path.join(PROMPTS_DIR, 'word-dictionary-system.txt'), 'utf8');
  return String(raw)
    .trim()
    .replaceAll('{{WORD_EXAMPLE_COUNT}}', String(WORD_EXAMPLE_COUNT));
}

function fillPrompt(userInput) {
  const w = String(userInput).trim();
  const { template, formatSample, formatSampleVerb } = getWordDictionaryUserPromptParts();
  return template
    .replaceAll('{{INPUT}}', w)
    .replaceAll('{{WORD}}', w)
    .replaceAll('{{WORD_EXAMPLE_COUNT}}', String(WORD_EXAMPLE_COUNT))
    .replaceAll('{{FORMAT_SAMPLE}}', formatSample.trim())
    .replaceAll('{{FORMAT_SAMPLE_VERB}}', formatSampleVerb.trim());
}

/** При старте API: пути и размеры файлов словарного промпта. */
export function logDictionaryPromptStartupInfo() {
  const dir = path.resolve(PROMPTS_DIR);
  const files = [
    'word-examples.txt',
    'word-dictionary-format-sample.json',
    'word-dictionary-format-sample-verb.json',
    'word-dictionary-system.txt',
  ];
  console.log(`[seashell] dictionary prompts dir: ${dir}`);
  for (const name of files) {
    const p = path.join(PROMPTS_DIR, name);
    try {
      const st = fs.statSync(p);
      console.log(`[seashell]   ${name}: ${st.size} bytes, mtime=${st.mtime.toISOString()}`);
    } catch {
      console.warn(`[seashell]   ${name}: MISSING`);
    }
  }
  console.log(`[seashell] word example limit: ${WORD_EXAMPLE_COUNT}`);
}

/** True if строка в основном латиница (англ. ввод без headwordEn из модели — допустимый fallback). */
function looksMostlyEnglish(s) {
  const t = String(s).replace(/\s+/g, '');
  if (!t) return false;
  let latin = 0;
  let cyr = 0;
  for (const ch of t) {
    if (/[A-Za-z]/.test(ch)) latin += 1;
    if (/[\u0400-\u04FF]/.test(ch)) cyr += 1;
  }
  return latin > 0 && latin >= cyr;
}

/** Кириллицы больше, чем латиницы (типичный русский текст). */
function looksMostlyCyrillic(s) {
  const t = String(s ?? '').replace(/\s+/g, '');
  if (!t) return false;
  let latin = 0;
  let cyr = 0;
  for (const ch of t) {
    if (/[A-Za-z]/.test(ch)) latin += 1;
    if (/[\u0400-\u04FF]/.test(ch)) cyr += 1;
  }
  return cyr > 0 && cyr > latin;
}

/**
 * В glossRu должна быть видна английская лемма. При «Обновить примеры» в API приходит уже англ. слово (lemma), не кириллица ввода — поэтому смотрим ещё и на сам gloss: если он в основном русский без леммы, дописываем «lemma — …».
 */
function glossAlreadyContainsLemma(gloss, lemma) {
  const g = String(gloss).trim();
  const hw = String(lemma).trim();
  if (!g || !hw) return true;
  if (!/\s/.test(hw)) {
    const esc = hw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      new RegExp(`(?:^|[^A-Za-z])${esc}(?:[^A-Za-z]|$)`, 'i').test(g) || new RegExp(`^${esc}\\b`, 'i').test(g)
    );
  }
  return g.toLowerCase().includes(hw.toLowerCase());
}

function ensureGlossRuShowsEnglishLemma(userWord, headwordEn, glossNullable) {
  if (glossNullable == null) return null;
  const raw = String(glossNullable).trim();
  if (!raw) return null;
  const hw = String(headwordEn ?? '').trim();
  if (!hw) return raw;
  if (glossAlreadyContainsLemma(raw, hw)) return raw;
  const needPrefix = !looksMostlyEnglish(userWord) || looksMostlyCyrillic(raw);
  if (!needPrefix) return raw;
  return `${hw} — ${raw}`;
}

function pickHeadwordEnFromParsed(parsed) {
  const keys = ['headwordEn', 'headword', 'englishHeadword', 'lemmaEn', 'wordEn'];
  for (const k of keys) {
    const v = parsed[k];
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ');
  }
  return '';
}

function extractJsonArray(text) {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallthrough
  }
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end <= start) {
    throw new Error('No JSON array in model response');
  }
  const parsed = JSON.parse(t.slice(start, end + 1));
  if (!Array.isArray(parsed)) {
    throw new Error('Parsed JSON is not an array');
  }
  return parsed;
}

function parseObjectPayload(parsed) {
  const glossRaw =
    parsed.glossRu ?? parsed.gloss_ru ?? parsed.wordRu ?? parsed.ru_gloss ?? parsed.gloss;
  let glossRu =
    typeof glossRaw === 'string' ? glossRaw.trim() : lineFromField(glossRaw);
  const glossNoteRaw = parsed.glossNoteRu ?? parsed.gloss_note_ru;
  const glossNoteRu =
    typeof glossNoteRaw === 'string' ? glossNoteRaw.trim() : lineFromField(glossNoteRaw);
  if (glossNoteRu) {
    if (glossRu) glossRu = `${glossRu} (${glossNoteRu})`;
    else glossRu = glossNoteRu;
  }
  const arr = parsed.examples ?? parsed.items ?? parsed.sentences;
  if (!Array.isArray(arr)) {
    throw new Error('Expected examples array in JSON object');
  }
  const headwordEn = pickHeadwordEnFromParsed(parsed);
  const verbUsage = normalizeVerbUsage(
    parsed.verbUsage ?? parsed.verb_usage ?? parsed.verbForms ?? parsed.verb_forms,
  );
  return {
    glossRu: glossRu || '',
    glossNoteRu: '',
    examples: normalizeExamples(arr),
    headwordEn,
    verbUsage,
  };
}

/** Объект { glossRu, examples } или устаревший массив из 15 примеров. */
function extractGenerationPayload(text) {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) {
      return {
        glossRu: '',
        glossNoteRu: '',
        examples: normalizeExamples(parsed),
        headwordEn: '',
        verbUsage: [],
      };
    }
    if (parsed && typeof parsed === 'object') {
      try {
        return parseObjectPayload(parsed);
      } catch {
        // не тот формат объекта — ниже пробуем вырезать JSON или массив
      }
    }
  } catch {
    // не полный JSON
  }
  const startObj = t.indexOf('{');
  const endObj = t.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) {
    try {
      const parsed = JSON.parse(t.slice(startObj, endObj + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parseObjectPayload(parsed);
      }
    } catch {
      // fallthrough
    }
  }
  const arr = extractJsonArray(text);
  return {
    glossRu: '',
    glossNoteRu: '',
    examples: normalizeExamples(arr),
    headwordEn: '',
    verbUsage: [],
  };
}

/** Нормализует ответ модели к { text, translation, noteRu }[]; пометки только в translation, noteRu пустой. */
function normalizeExamples(arr) {
  const out = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push({ text, translation: '', noteRu: '' });
    } else if (item && typeof item === 'object') {
      let text = englishLineFromItem(item);
      let translation = russianLineFromItem(item);
      if (
        text &&
        translation &&
        looksMostlyCyrillic(text) &&
        !looksMostlyCyrillic(translation) &&
        /[A-Za-z]{2,}/.test(translation)
      ) {
        const swap = text;
        text = translation;
        translation = swap;
      }
      let noteRu = stylisticNoteFromItem(item);
      const sp = splitTranslationTail(translation);
      if (sp.noteRu) {
        translation = sp.translation;
        if (!String(noteRu).trim()) noteRu = sp.noteRu;
      }
      const tr = String(translation).trim();
      const nt = String(noteRu).trim();
      let oneLine = tr;
      if (tr && nt) oneLine = `${tr} (${nt})`;
      else if (!tr && nt) oneLine = nt;
      if (text) out.push({ text, translation: oneLine, noteRu: '' });
    }
  }
  return out;
}

function sanitizeGlossRu(glossRuRaw) {
  const g = String(glossRuRaw ?? '').trim();
  if (!g) return null;
  // Если модель сама пишет, что слово выдуманное/не слово — не показываем "значение".
  if (/(вымыш|придуман|не\s*слово|не\s*существ|имя\s*собствен|без\s*конкретн)/i.test(g)) {
    return null;
  }
  return g;
}

async function gigaChatWordExamplesCompletion(userContent, model, token, temperature) {
  let res;
  try {
    res = await gigaFetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildDictionarySystemContent() },
          { role: 'user', content: userContent },
        ],
        temperature,
        max_tokens: 4000,
      }),
    });
  } catch (e) {
    throw mapNetErr(e, 'chat');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GigaChat chat: ${res.status} ${JSON.stringify(data)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty GigaChat response');
  }
  return content;
}

/** Температура для генерации словаря: из .env или 0.38. */
function wordExamplesTemperature() {
  const raw = process.env.GIGACHAT_WORD_TEMPERATURE?.trim();
  if (!raw) return 0.38;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return 0.38;
  return Math.min(2, Math.max(0, n));
}

export async function generateWordExamples(word) {
  const model = process.env.GIGACHAT_MODEL_NAME || 'GigaChat';
  const token = await getAccessToken();
  const userContent = fillPrompt(word);
  const content = await gigaChatWordExamplesCompletion(
    userContent,
    model,
    token,
    wordExamplesTemperature(),
  );

  let payload;
  try {
    payload = extractGenerationPayload(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Ответ GigaChat не разобрался как JSON (${msg}). Частые причины: в ответе есть markdown вместо чистого JSON, обрезан длинный ответ, или ошибка в структуре. Попробуй ещё раз.`,
    );
  }
  const { glossRu, examples, headwordEn: headFromPayload, verbUsage } = payload;

  if (examples.length < WORD_EXAMPLE_COUNT) {
    throw new Error(`Expected ${WORD_EXAMPLE_COUNT} examples, got ${examples.length}`);
  }

  const g = sanitizeGlossRu(glossRu);
  let headwordEn = typeof headFromPayload === 'string' ? headFromPayload.trim().replace(/\s+/g, ' ') : '';
  if (!headwordEn) {
    if (looksMostlyEnglish(word)) {
      headwordEn = String(word).trim().replace(/\s+/g, ' ');
    } else {
      throw new Error(
        'Модель не вернула английскую форму слова (headwordEn). Попробуй добавить ещё раз.',
      );
    }
  }

  const trimmed = examples.slice(0, WORD_EXAMPLE_COUNT);

  const glossOut = ensureGlossRuShowsEnglishLemma(word, headwordEn, g);

  return {
    glossRu: glossOut,
    glossNoteRu: null,
    examples: trimmed,
    headwordEn,
    verbUsage: Array.isArray(verbUsage) && verbUsage.length === 3 ? verbUsage : [],
  };
}

function loadPracticeTurnTemplate() {
  return fs.readFileSync(path.join(__dirname, 'prompts', 'practice-turn.txt'), 'utf8');
}

function buildPracticePrompt(userText, historyLines) {
  const h =
    !historyLines?.length
      ? '(empty)'
      : historyLines
          .map((m) => `${m.role}: ${m.text}`)
          .join('\n')
          .slice(0, 16000);
  return loadPracticeTurnTemplate()
    .replace('{{USER_TEXT}}', String(userText).trim().slice(0, 4000))
    .replace('{{HISTORY}}', h);
}

function extractJsonObject(text) {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fallthrough
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object in model response');
  }
  return JSON.parse(t.slice(start, end + 1));
}

function normalizePracticeTurn(obj) {
  const echo = String(obj.echo ?? obj.user ?? '').trim();
  const reply = String(obj.reply ?? obj.answer ?? '').trim();
  let corrections = obj.corrections;
  if (corrections === null || corrections === undefined || corrections === 'null') {
    corrections = null;
  } else {
    corrections = String(corrections).trim() || null;
  }
  if (!reply) {
    throw new Error('Empty reply in practice response');
  }
  return { echo: echo || null, corrections, reply };
}

/** Один ход диалога: эхо реплики, правки, ответ собеседника. */
export async function generatePracticeTurn({ userText, history }) {
  const model = process.env.GIGACHAT_MODEL_NAME || 'GigaChat';
  const token = await getAccessToken();
  const historyLines = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.text === 'string')
        .slice(-28)
        .map((m) => ({
          role: m.role === 'assistant' ? 'Assistant' : 'User',
          text: m.text.slice(0, 1200),
        }))
    : [];
  const userContent = buildPracticePrompt(userText, historyLines);

  let res;
  try {
    res = await gigaFetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You output only valid JSON when asked. No markdown fences. Keys: echo, corrections, reply. The "reply" must read like a sharp, natural native speaker in chat — specific, coherent with prior turns, not generic and not therapeutic.',
          },
          { role: 'user', content: userContent },
        ],
        temperature: 0.52,
        top_p: 0.92,
        max_tokens: 700,
        repetition_penalty: 1.06,
      }),
    });
  } catch (e) {
    throw mapNetErr(e, 'chat');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GigaChat chat: ${res.status} ${JSON.stringify(data)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty GigaChat response');
  }

  const raw = extractJsonObject(content);
  return normalizePracticeTurn(raw);
}
