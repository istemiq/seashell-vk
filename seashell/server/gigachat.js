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
import { englishLineFromItem, lineFromField, russianLineFromItem } from './exampleFields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (tlsInsecure()) {
    if (!insecureDispatcher) {
      insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
    return undiciFetch(url, { ...init, dispatcher: insecureDispatcher });
  }
  return undiciFetch(url, init);
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

function loadPromptTemplate() {
  const p = path.join(__dirname, 'prompts', 'word-examples.txt');
  return fs.readFileSync(p, 'utf8');
}

function fillPrompt(word) {
  const w = String(word).trim();
  return loadPromptTemplate().replaceAll('{{WORD}}', w);
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
  const glossRu =
    typeof glossRaw === 'string' ? glossRaw.trim() : lineFromField(glossRaw);
  const arr = parsed.examples ?? parsed.items ?? parsed.sentences;
  if (!Array.isArray(arr)) {
    throw new Error('Expected examples array in JSON object');
  }
  return { glossRu: glossRu || '', examples: normalizeExamples(arr) };
}

/** Объект { glossRu, examples } или устаревший массив из 15 примеров. */
function extractGenerationPayload(text) {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) {
      return { glossRu: '', examples: normalizeExamples(parsed) };
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
  return { glossRu: '', examples: normalizeExamples(arr) };
}

/** Нормализует ответ модели к { text, translation }[] (старый формат — только строки). */
function normalizeExamples(arr) {
  const out = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) out.push({ text, translation: '' });
    } else if (item && typeof item === 'object') {
      const text = englishLineFromItem(item);
      const translation = russianLineFromItem(item);
      if (text) out.push({ text, translation });
    }
  }
  return out;
}

export async function generateWordExamples(word) {
  const model = process.env.GIGACHAT_MODEL_NAME || 'GigaChat';
  const token = await getAccessToken();
  const userContent = fillPrompt(word);

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
              'You output only valid JSON when asked. No markdown fences. Follow the user format exactly.',
          },
          { role: 'user', content: userContent },
        ],
        temperature: 0.6,
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

  const { glossRu, examples } = extractGenerationPayload(content);

  if (examples.length < 15) {
    throw new Error(`Expected 15 examples, got ${examples.length}`);
  }

  const g = (glossRu ?? '').trim();
  return {
    glossRu: g || null,
    examples: examples.slice(0, 15),
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
