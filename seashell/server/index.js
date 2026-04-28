/**
 * HTTP API для мини-приложения: словарь (PostgreSQL), разговорная практика (GigaChat).
 * Публично: GET /api/health. Остальное — только с заголовком X-VK-User-Id (middleware ниже).
 * Запуск: из каталога seashell — npm run api или npm run dev.
 */
import './load-env.js';
import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
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

// --- Общие middleware: CORS (фронт на другом порту), JSON-тело запросов ---
app.use(cors({ origin: true }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function vkUserId(req) {
  const h = req.headers['x-vk-user-id'];
  const n = h != null ? parseInt(String(h), 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

// Маршруты ниже (всё после этого app.use) требуют заголовок X-VK-User-Id. /api/health объявлен выше — без авторизации.
app.use((req, res, next) => {
  const uid = vkUserId(req);
  if (!uid) {
    return res.status(401).json({ error: 'Missing or invalid X-VK-User-Id header' });
  }
  req.vkUserId = uid;
  next();
});

function normalizeWord(w) {
  return String(w || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTtsText(t) {
  return String(t || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function pickEspeakCommand() {
  // На разных системах пакет может ставить разные бинарники.
  return process.env.ESPEAK_CMD?.trim() || 'espeak-ng';
}

// --- TTS (фолбэк для мобильных WebView, где Web Speech API молчит) ---
app.get('/api/tts', async (req, res) => {
  const text = normalizeTtsText(req.query?.text ?? '');
  if (!text) return res.status(400).json({ error: 'Empty text' });
  if (text.length > 400) return res.status(400).json({ error: 'Text too long (max 400 chars)' });

  const cmd = pickEspeakCommand();
  const args = [
    '--stdout',
    '-v',
    'en-us',
    '-s',
    String(Number(process.env.ESPEAK_SPEED) || 165),
    text,
  ];

  let child;
  try {
    child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return res.status(501).json({
      error:
        'TTS is not available on the server. Install espeak-ng (apt install espeak-ng) or set ESPEAK_CMD to an available binary.',
    });
  }

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
    if (stderr.length > 2000) stderr = stderr.slice(-2000);
  });

  child.on('error', () => {
    res.status(501).json({
      error:
        'TTS is not available on the server. Install espeak-ng (apt install espeak-ng) or set ESPEAK_CMD to an available binary.',
    });
  });

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  child.stdout.pipe(res);

  child.on('close', (code) => {
    if (code === 0) return;
    try {
      res.end();
    } catch {
      // ignore
    }
  });
});

// --- Разговорная практика (один ход диалога через GigaChat) ---
app.post('/api/practice/turn', async (req, res) => {
  const userText = normalizeWord(req.body?.userText ?? req.body?.text ?? '');
  if (!userText || userText.length > 4000) {
    return res.status(400).json({ error: 'Invalid text' });
  }
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const tone = typeof req.body?.tone === 'string' ? req.body.tone : undefined;
  try {
    const turn = await generatePracticeTurn({ userText, history, tone });
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
app.post('/api/refresh-examples', handleRefreshExamples);
app.post('/api/words/:id/refresh-examples', handleRefreshExamples);

app.post('/api/words', async (req, res) => {
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
  app.listen(PORT, '0.0.0.0', () => {
    const tls = process.env.GIGACHAT_TLS_INSECURE?.trim();
    console.log(`API: http://0.0.0.0:${PORT} (PORT=${process.env.PORT ?? 'default 3001'})`);
    console.log(
      `GigaChat TLS relaxed (undici): ${tlsInsecure() ? 'yes' : 'no'} | NODE_ENV=${process.env.NODE_ENV ?? '(не задан)'} | GIGACHAT_TLS_INSECURE=${tls ?? '(unset)'}`,
    );
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
