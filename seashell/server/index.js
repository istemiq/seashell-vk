/**
 * HTTP API для мини-приложения: словарь (PostgreSQL), разговорная практика (GigaChat).
 * Публично: GET /api/health. Остальное — только с заголовком X-VK-User-Id (middleware ниже).
 * Запуск: из каталога seashell — npm run api или npm run dev.
 */
import './load-env.js';
import express from 'express';
import cors from 'cors';
import { verifyVkLaunchParams } from './vkSignature.js';
import {
  initDb,
  listWords,
  listWordsInSet,
  getWordWithExamples,
  insertWordWithExamples,
  replaceExamplesForWord,
  deleteWord,
  findWordByLemma,
  listSets,
  createSet,
  renameSet,
  deleteSetAndOrphanWords,
  replaceWordSets,
} from './db.js';
import { generateWordExamples, generatePracticeTurn, tlsInsecure } from './gigachat.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// --- Общие middleware: CORS (фронт на другом порту), JSON-тело запросов ---
function allowedOrigins() {
  const raw = String(process.env.CORS_ORIGINS ?? '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ORIGINS = allowedOrigins();
const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';

app.use(
  cors({
    origin(origin, cb) {
      // non-browser requests (curl, server-to-server)
      if (!origin) return cb(null, true);
      // dev default: allow all
      if (!isProd && !ORIGINS) return cb(null, true);
      // prod default: allow none unless configured
      if (isProd && !ORIGINS) return cb(new Error('CORS blocked'), false);
      return cb(null, ORIGINS.includes(origin));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function makeRateLimiter({ windowMs, max, keyFn }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyFn(req) ?? '');
    if (!key) return res.status(400).json({ error: 'Missing rate limit key' });
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    cur.count += 1;
    if (cur.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    return next();
  };
}

function vkUserIdFromHeader(req) {
  const h = req.headers['x-vk-user-id'];
  const n = h != null ? parseInt(String(h), 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function vkLaunchParamsFromHeader(req) {
  const h = req.headers['x-vk-launch-params'];
  const s = h != null ? String(h).trim() : '';
  return s || null;
}

// Маршруты ниже (всё после этого app.use) требуют заголовок X-VK-User-Id. /api/health объявлен выше — без авторизации.
app.use((req, res, next) => {
  const secret = String(process.env.VK_APP_SECRET ?? '').trim();
  const lp = vkLaunchParamsFromHeader(req);

  if (secret) {
    if (!lp) {
      return res.status(401).json({ error: 'Missing X-VK-Launch-Params header' });
    }
    const v = verifyVkLaunchParams(lp, secret);
    if (!v.ok) {
      return res.status(401).json({ error: 'Invalid VK launch params signature' });
    }
    const uid = v.vkUserId != null ? parseInt(String(v.vkUserId), 10) : NaN;
    if (!Number.isFinite(uid) || uid <= 0) {
      return res.status(401).json({ error: 'Missing or invalid vk_user_id in launch params' });
    }
    req.vkUserId = uid;
    return next();
  }

  // Dev fallback (или если secret не настроен): старый заголовок.
  const uid = vkUserIdFromHeader(req);
  if (!uid) return res.status(401).json({ error: 'Missing or invalid X-VK-User-Id header' });
  req.vkUserId = uid;
  next();
});

function normalizeWord(w) {
  return String(w || '')
    .trim()
    .replace(/\s+/g, ' ');
}

// --- Разговорная практика (один ход диалога через GigaChat) ---
const limitPractice = makeRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyFn: (req) => `practice:${req.vkUserId}`,
});

const limitGeneration = makeRateLimiter({
  windowMs: 60_000,
  max: 6,
  keyFn: (req) => `gen:${req.vkUserId}`,
});

app.post('/api/practice/turn', limitPractice, async (req, res) => {
  const userText = normalizeWord(req.body?.userText ?? req.body?.text ?? '');
  if (!userText || userText.length > 4000) {
    return res.status(400).json({ error: 'Invalid text' });
  }
  const historyRaw = Array.isArray(req.body?.history) ? req.body.history : [];
  const history = historyRaw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-28)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1200) }));
  try {
    const turn = await generatePracticeTurn({ userText, history });
    res.json({
      echo: turn.echo || userText,
      corrections: turn.corrections,
      reply: turn.reply,
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message || 'Generation failed' });
  }
});

// --- Словарь: список, карточка, добавление, удаление, обновление примеров ---
app.get('/api/words', async (req, res) => {
  try {
    const setIdRaw = req.query?.setId;
    const setId = setIdRaw != null && setIdRaw !== '' ? parseInt(String(setIdRaw), 10) : NaN;
    const rows =
      Number.isFinite(setId) && setId > 0
        ? await listWordsInSet(req.vkUserId, setId)
        : await listWords(req.vkUserId);
    res.json({ words: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- Сеты слов ---
app.get('/api/sets', async (req, res) => {
  try {
    const rows = await listSets(req.vkUserId);
    res.json({ sets: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/sets', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  try {
    const created = await createSet(req.vkUserId, name);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    // unique violation
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'Set already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/sets/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  if (!name || name.length > 80) return res.status(400).json({ error: 'Invalid name' });
  try {
    const updated = await renameSet(req.vkUserId, id, name);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    console.error(e);
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'Set already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/sets/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  try {
    const r = await deleteSetAndOrphanWords(req.vkUserId, id);
    if (!r.deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, removedWordIds: r.removedWordIds });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/words/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await getWordWithExamples(req.vkUserId, id);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/words/:id/sets', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid word id' });
  const setIds = Array.isArray(req.body?.setIds) ? req.body.setIds : [];
  try {
    const out = await replaceWordSets(req.vkUserId, id, setIds);
    if (!out) return res.status(404).json({ error: 'Not found' });
    res.json({ setIds: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

async function handleRefreshExamples(req, res) {
  const idFromParam =
    req.params?.id != null && req.params.id !== '' ? parseInt(req.params.id, 10) : NaN;
  const idFromBody =
    req.body?.wordId != null || req.body?.id != null
      ? parseInt(String(req.body.wordId ?? req.body.id), 10)
      : NaN;
  const id =
    Number.isFinite(idFromParam) && idFromParam > 0 ? idFromParam : idFromBody;
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid word id' });
  }
  try {
    const row = await getWordWithExamples(req.vkUserId, id);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    const generated = await generateWordExamples(row.word);
    const saved = await replaceExamplesForWord(req.vkUserId, id, generated);
    res.json(saved);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message || 'Generation failed' });
  }
}

/** Два URL: короткий — для совместимости; длинный — как в REST. */
app.post('/api/refresh-examples', limitGeneration, handleRefreshExamples);
app.post('/api/words/:id/refresh-examples', limitGeneration, handleRefreshExamples);

app.post('/api/words', limitGeneration, async (req, res) => {
  const word = normalizeWord(req.body?.word);
  if (!word || word.length > 200) {
    return res.status(400).json({ error: 'Invalid word' });
  }

  try {
    if (await findWordByLemma(req.vkUserId, word)) {
      return res.status(409).json({ error: 'Word already exists' });
    }

    const generated = await generateWordExamples(word);
    const saved = await insertWordWithExamples(req.vkUserId, word, generated);
    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message || 'Generation failed' });
  }
});

app.delete('/api/words/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = await deleteWord(req.vkUserId, id);
    if (!ok) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

async function start() {
  await initDb();
  if (
    String(process.env.NODE_ENV ?? '').toLowerCase() === 'production' &&
    !String(process.env.VK_APP_SECRET ?? '').trim()
  ) {
    console.warn('[seashell] VK_APP_SECRET пуст при NODE_ENV=production — клиент можно подделать только по X-VK-User-Id.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    const tls = process.env.GIGACHAT_TLS_INSECURE?.trim();
    const model = String(process.env.GIGACHAT_MODEL_NAME || '').trim() || 'GigaChat';
    console.log(`API: http://0.0.0.0:${PORT} (PORT=${process.env.PORT ?? 'default 3001'})`);
    console.log(
      `GigaChat: model=${model} (из GIGACHAT_MODEL_NAME; пусто → в коде подставляется базовый GigaChat)`,
    );
    console.log(
      `GigaChat TLS relaxed (undici): ${tlsInsecure() ? 'yes' : 'no'} | NODE_ENV=${process.env.NODE_ENV ?? '(не задан)'} | GIGACHAT_TLS_INSECURE=${tls ?? '(unset)'}`,
    );
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
