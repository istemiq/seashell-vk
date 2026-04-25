/**
 * HTTP API для мини-приложения: словарь (PostgreSQL), разговорная практика (GigaChat).
 * Публично: GET /api/health. Остальное — только с заголовком X-VK-User-Id (middleware ниже).
 * Запуск: из каталога seashell — npm run api или npm run dev.
 */
import './load-env.js';
import express from 'express';
import cors from 'cors';
import {
  initDb,
  listWords,
  getWordWithExamples,
  insertWordWithExamples,
  replaceExamplesForWord,
  deleteWord,
  findWordByLemma,
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
    const rows = await listWords(req.vkUserId);
    res.json({ words: rows });
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
