import './load-env.js';
import express from 'express';
import cors from 'cors';
import {
  listWords,
  getWordWithExamples,
  insertWordWithExamples,
  replaceExamplesForWord,
  deleteWord,
  findWordByLemma,
} from './db.js';
import { generateWordExamples, tlsInsecure } from './gigachat.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// CORS до любых маршрутов (в т.ч. health и JSON)
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

app.get('/api/words', (req, res) => {
  try {
    const rows = listWords(req.vkUserId);
    res.json({ words: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/words/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = getWordWithExamples(req.vkUserId, id);
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
    const row = getWordWithExamples(req.vkUserId, id);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    const generated = await generateWordExamples(row.word);
    const saved = replaceExamplesForWord(req.vkUserId, id, generated);
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
    if (findWordByLemma(req.vkUserId, word)) {
      return res.status(409).json({ error: 'Word already exists' });
    }

    const generated = await generateWordExamples(word);
    const saved = insertWordWithExamples(req.vkUserId, word, generated);
    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message || 'Generation failed' });
  }
});

app.delete('/api/words/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = deleteWord(req.vkUserId, id);
    if (!ok) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const tls = process.env.GIGACHAT_TLS_INSECURE?.trim();
  console.log(`API: http://0.0.0.0:${PORT} (PORT=${process.env.PORT ?? 'default 3001'})`);
  console.log(
    `GigaChat TLS relaxed (undici): ${tlsInsecure() ? 'yes' : 'no'} | NODE_ENV=${process.env.NODE_ENV ?? '(не задан)'} | GIGACHAT_TLS_INSECURE=${tls ?? '(unset)'}`
  );
});
