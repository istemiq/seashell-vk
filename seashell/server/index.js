/**
 * HTTP API для мини-приложения: словарь (PostgreSQL), разговорная практика (GigaChat).
 * Публично: GET /api/health. Остальное — только с заголовком X-VK-User-Id (middleware ниже).
 * Запуск: из каталога seashell — npm run api или npm run dev.
 */
import './load-env.js';
import express from 'express';
import cors from 'cors';
import { verifyVkLaunchParams } from './vkSignature.js';
import { verifyTelegramInitData } from './telegramAuth.js';
import { assertAllowedUserContent } from './contentPolicy.js';
import { WORD_EXAMPLE_COUNT } from './dictionaryConstants.js';
import {
  initDb,
  dictionaryGenerationCacheMeta,
  listWords,
  listWordsInSet,
  getWordWithExamples,
  getCachedWordGeneration,
  insertWordWithExamples,
  replaceExamplesForWord,
  deleteWord,
  findWordByLemma,
  saveCachedWordGeneration,
  listSets,
  createSet,
  renameSet,
  deleteSetAndOrphanWords,
  replaceWordSets,
  countWordsSince,
  getLastAdViewTime,
  countAdViewsTotal,
  resetUserQuotaForAdmin,
  recordAdView,
} from './db.js';
import {
  generateWordExamples,
  resolveHeadwordEnQuick,
  tlsInsecure,
  logDictionaryPromptStartupInfo,
  wordInputLooksEnglish,
} from './gigachat.js';
import { listPracticeExpertsForUi, isPracticeExpertId, PRACTICE_EXPERT_START_MARKER } from './practiceExperts.js';
import {
  getPracticeSessionBundle,
  runExpertPracticeTurn,
  runFreePracticeTurn,
  runWordPracticeTurn,
} from './practiceService.js';
import { listPracticeSessions, countPracticeTurnsSince } from './practiceDb.js';
import {
  QUOTA_LIMIT_ERROR,
  FREE_WORDS_PER_AD,
  FREE_PRACTICE_PER_AD,
  practiceBatchLimit,
  wordsBatchLimit,
} from './limitsPolicy.js';
import { normalizeContentLocale } from './promptLocales.js';
import { llmProviderLabel, resolveLlmModel, resolveLlmProvider } from './llmProvider.js';
import { enqueueGigaChat, gigaChatQueueStats } from './gigachatQueue.js';
import { isPayloadValidForContentLocale } from './localeValidation.js';
import { isHeadwordValidForInput } from './dictionaryInputMode.js';
import { registerTtsStatic, registerTtsSpeak } from './tts.js';
import { registerSttTranscribe } from './stt.js';
import {
  assertPracticeAccess,
  assertRefreshAccess,
  assertWordsAccess,
  buildUserPlanResponse,
  chargePracticeCredit,
  chargeRefreshCredit,
  chargeWordCredit,
  isPremiumForUi,
} from './entitlements.js';
import {
  BILLING_PRODUCT_SUBSCRIPTION,
  BILLING_PRODUCT_TOPUP,
} from './billingPolicy.js';
import { createStarsInvoiceLink, handleTelegramBillingUpdate, verifyWebhookSecret } from './telegramBilling.js';

function mapPracticeSessionRow(row) {
  return {
    id: row.id,
    mode: row.mode,
    expertId: row.expert_id ?? null,
    targetWordId: row.target_word_id != null ? Number(row.target_word_id) : null,
    contentLocale: row.content_locale,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    messageCount: row.message_count ?? 0,
    lastPreview: row.last_preview ?? null,
  };
}

function isAppAdmin(vkUserId) {
  const excludeIds = (process.env.ADMIN_EXCLUDE_USER_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return excludeIds.includes(vkUserId);
}

async function getWordsQuotaStatus(vkUserId) {
  const since = await getLastAdViewTime(vkUserId, 'words');
  const [used, adViews] = await Promise.all([
    countWordsSince(vkUserId, since),
    countAdViewsTotal(vkUserId, 'words'),
  ]);
  return {
    used,
    limit: wordsBatchLimit(),
    adViews,
    bonusPerAd: FREE_WORDS_PER_AD,
  };
}

async function getPracticeQuotaStatus(vkUserId) {
  const since = await getLastAdViewTime(vkUserId, 'practice');
  const [used, adViews] = await Promise.all([
    countPracticeTurnsSince(vkUserId, since),
    countAdViewsTotal(vkUserId, 'practice'),
  ]);
  return {
    used,
    limit: practiceBatchLimit(),
    adViews,
    bonusPerAd: FREE_PRACTICE_PER_AD,
  };
}
import { verifyAdminStatsToken, adminStatsToken } from './adminAuth.js';
import { fetchUsageStats } from './usageStats.js';
import { getDbPool } from './db.js';
import { clientIp } from './securityHelpers.js';
import { generationUserMessage } from './userGenerationErrors.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-Frame-Options', 'DENY');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
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

function respondDatabaseError(res, e) {
  console.error(e);
  const payload = { error: 'Database error' };
  if (!isProd) {
    payload.hint =
      'PostgreSQL не доступен. Запустите Docker Desktop, затем в seashell_tg_clean: npm run db';
    if (e?.message) payload.detail = e.message;
  }
  res.status(500).json(payload);
}

/** VK Mini Apps static hosting (prod/stage *.pages*.vk-apps.com). */
function isVkAppsHostingOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'vk-apps.com' || host.endsWith('.vk-apps.com');
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, cb) {
      // non-browser requests (curl, server-to-server)
      if (!origin) return cb(null, true);
      // dev default: allow all
      if (!isProd && !ORIGINS) return cb(null, true);
      // prod default: allow none unless configured
      if (isProd && !ORIGINS) return cb(new Error('CORS blocked'), false);
      if (ORIGINS.includes(origin)) return cb(null, true);
      if (isVkAppsHostingOrigin(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'), false);
    },
    credentials: false,
    allowedHeaders: [
      'Content-Type',
      'X-Telegram-Init-Data',
      'X-Platform-User-Id',
      'X-VK-User-Id',
      'X-VK-Launch-Params',
      'X-UI-Locale',
      'X-Content-Locale',
    ],
  }),
);
app.use(express.json({ limit: '256kb' }));

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, wordExampleLimit: WORD_EXAMPLE_COUNT, gigaChatQueue: gigaChatQueueStats() });
});

const limitAdminStats = makeRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyFn: (req) => `admin-stats:${clientIp(req)}`,
});

/** Usage counters for admins (Bearer ADMIN_STATS_TOKEN). No user PII beyond numeric ids. */
app.get('/api/admin/stats', limitAdminStats, async (req, res) => {
  if (!adminStatsToken()) {
    return res.status(503).json({ error: 'Admin stats not configured (ADMIN_STATS_TOKEN)' });
  }
  if (!verifyAdminStatsToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const stats = await fetchUsageStats(getDbPool());
    res.json(stats);
  } catch (e) {
    respondDatabaseError(res, e);
  }
});

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

function telegramInitDataFromHeader(req) {
  const h = req.headers['x-telegram-init-data'];
  return h != null ? String(h).trim() : '';
}

/** Локальная разработка TG без initData: тот же id, что шлёт фронт в X-VK-User-Id. */
function tryTelegramDevHeaderAuth(req) {
  if (isProd) return false;
  const uid = vkUserIdFromHeader(req);
  if (!uid) return false;
  req.vkUserId = uid;
  req.authVia = 'telegram-dev-header';
  return true;
}

function tryTelegramInitDataAuth(req, res) {
  const tgInit = telegramInitDataFromHeader(req);
  if (!tgInit) return false;

  const tgToken = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!tgToken) {
    if (tryTelegramDevHeaderAuth(req)) return true;
    res.status(401).json({
      error: 'Telegram init data received but TELEGRAM_BOT_TOKEN is not configured on the server',
    });
    return true;
  }

  const v = verifyTelegramInitData(tgInit, tgToken);
  if (!v.ok) {
    res.status(401).json({ error: 'Invalid Telegram init data' });
    return true;
  }
  req.vkUserId = v.userId;
  req.authVia = 'telegram';
  return true;
}

function isLocalhostOrigin(req) {
  const origin = String(req.headers.origin ?? '');
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function tryLocalhostHeaderAuth(req) {
  if (isProd) return false;
  if (String(process.env.TELEGRAM_ALLOW_LOCALHOST_HEADER ?? '').trim() !== '1') return false;
  if (!isLocalhostOrigin(req)) return false;
  const uid = vkUserIdFromHeader(req);
  if (!uid) return false;
  req.vkUserId = uid;
  req.authVia = 'localhost-header';
  return true;
}


/** Запрос с CDN хостинга мини-аппа (робот VK грузит index.html отсюда, не с vk.com). */
function isVkHostingRequest(req) {
  const origin = req.headers.origin;
  if (origin && isVkAppsHostingOrigin(origin)) return true;
  const ref = String(req.headers.referer ?? '');
  if (!ref) return false;
  try {
    const host = new URL(ref).hostname.toLowerCase();
    return host === 'vk-apps.com' || host.endsWith('.vk-apps.com');
  } catch {
    return false;
  }
}

/** Безопасные GET, которые фронт может вызвать при старте; POST и мутации по-прежнему требуют подпись. */
function isVkReviewerProbeRequest(req) {
  if (req.method !== 'GET') return false;
  const p = req.path;
  return p === '/api/words' || p === '/api/sets' || /^\/api\/words\/\d+$/.test(p);
}

function tryVkReviewerProbe(req) {
  if (!isVkHostingRequest(req) || !isVkReviewerProbeRequest(req)) return false;
  req.vkReviewerProbe = true;
  return true;
}

/** VK deploy robot: empty dictionary responses, no real user data. */
function vkReviewerProbeMiddleware(req, res, next) {
  if (!req.vkReviewerProbe) return next();
  if (req.method !== 'GET') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const p = req.path;
  if (p === '/api/words') return res.json({ words: [] });
  if (p === '/api/sets') return res.json({ sets: [] });
  if (/^\/api\/words\/\d+$/.test(p)) return res.status(404).json({ error: 'Not found' });
  return res.status(403).json({ error: 'Forbidden' });
}

// --- Public static: TTS mp3 cache (/tts/v1/...) ---
// Must be registered before auth middleware: mp3 files are fetched by native player without headers.
registerTtsStatic(app);

// Telegram Bot webhook (Stars payments) — no user auth, secret token only.
app.post('/api/telegram/webhook', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await handleTelegramBillingUpdate(req.body ?? {});
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[billing] webhook error', e);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

function isTelegramFrontRequest(req) {
  const urls = [req.headers.origin, req.headers.referer].filter(Boolean);
  for (const raw of urls) {
    try {
      if (new URL(String(raw)).hostname.toLowerCase() === 'front.sishel.ru') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

// Маршруты ниже: Telegram initData ИЛИ VK launch params ИЛИ dev-заголовок.
app.use((req, res, next) => {
  if (tryTelegramInitDataAuth(req, res)) {
    if (req.vkUserId) return next();
    return;
  }

  const secret = String(process.env.VK_APP_SECRET ?? '').trim();
  const lp = vkLaunchParamsFromHeader(req);

  if (secret) {
    if (!lp) {
      if (tryVkReviewerProbe(req)) return next();
      if (tryLocalhostHeaderAuth(req)) return next();
      if (tryTelegramDevHeaderAuth(req)) return next();
      if (isTelegramFrontRequest(req)) {
        return res.status(401).json({ error: 'Missing X-Telegram-Init-Data header' });
      }
      return res.status(401).json({ error: 'Missing X-VK-Launch-Params header' });
    }
    const v = verifyVkLaunchParams(lp, secret);
    if (!v.ok) {
      if (tryVkReviewerProbe(req)) return next();
      return res.status(401).json({ error: 'Invalid VK launch params signature' });
    }
    const uid = v.vkUserId != null ? parseInt(String(v.vkUserId), 10) : NaN;
    if (!Number.isFinite(uid) || uid <= 0) {
      if (tryVkReviewerProbe(req)) return next();
      return res.status(401).json({ error: 'Missing or invalid vk_user_id in launch params' });
    }
    req.vkUserId = uid;
    return next();
  }

  // Dev fallback только вне production (если secret не настроен локально).
  if (isProd) {
    return res.status(503).json({ error: 'Server authentication is not configured' });
  }
  const uid = vkUserIdFromHeader(req);
  if (!uid) return res.status(401).json({ error: 'Missing or invalid X-VK-User-Id header' });
  req.vkUserId = uid;
  next();
});

app.use(vkReviewerProbeMiddleware);

app.get('/api/user/plan', async (req, res) => {
  try {
    const plan = await buildUserPlanResponse(req.vkUserId);
    plan.admin = isAppAdmin(req.vkUserId);
    res.json(plan);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

app.post('/api/billing/invoice', async (req, res) => {
  const product = String(req.body?.product ?? BILLING_PRODUCT_SUBSCRIPTION).trim();
  if (product !== BILLING_PRODUCT_SUBSCRIPTION && product !== BILLING_PRODUCT_TOPUP) {
    return res.status(400).json({ error: 'Invalid product' });
  }
  if (!String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()) {
    return res.status(503).json({ error: 'Billing is not configured' });
  }
  try {
    const invoiceUrl = await createStarsInvoiceLink(req.vkUserId, product);
    res.json({ invoiceUrl, product });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Failed to create invoice' });
  }
});

app.get('/api/user/limits', async (req, res) => {
  const premium = await isPremiumForUi(req.vkUserId);
  if (premium) {
    const plan = await buildUserPlanResponse(req.vkUserId);
    return res.json({
      premium: true,
      subscription: plan.subscription,
    });
  }
  try {
    const [words, practice] = await Promise.all([
      getWordsQuotaStatus(req.vkUserId),
      getPracticeQuotaStatus(req.vkUserId),
    ]);

    res.json({
      premium: false,
      words,
      practice,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch limits' });
  }
});

app.post('/api/ads/reward', async (req, res) => {
  const type = req.body?.type;
  if (type !== 'words' && type !== 'practice') {
    return res.status(400).json({ error: 'Invalid reward type' });
  }
  try {
    await recordAdView(req.vkUserId, type);
    const status = type === 'words'
      ? await getWordsQuotaStatus(req.vkUserId)
      : await getPracticeQuotaStatus(req.vkUserId);

    res.json({
      success: true,
      adViews: status.adViews,
      limit: status.limit,
      used: status.used,
      bonusPerAd: status.bonusPerAd,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to record ad view' });
  }
});

app.post('/api/admin/reset-limits', async (req, res) => {
  if (!isAppAdmin(req.vkUserId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const targetId = parseInt(req.body?.targetUserId, 10);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid target user id' });
  }
  try {
    await resetUserQuotaForAdmin(targetId);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reset limits' });
  }
});

registerTtsSpeak(app, { makeRateLimiter });
registerSttTranscribe(app, { makeRateLimiter });

function normalizeWord(w) {
  return String(w || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function responseStatusForGenerationError(e) {
  const status = Number(e?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 600) return status;
  return 502;
}

function sendGenerationError(res, req, e, statusOverride) {
  const status = statusOverride ?? e?.status ?? responseStatusForGenerationError(e);
  if (
    status >= 400 &&
    status < 500 &&
    e?.message &&
    !String(e.message).includes('OpenRouter') &&
    !String(e.message).includes('GigaChat')
  ) {
    return res.status(status).json({ error: String(e.message) });
  }
  const locale = resolveUiLocale(req);
  const { error, code } = generationUserMessage(e, locale);
  return res.status(status).json({ error, code });
}

function resolveContentLocale(req) {
  const fromContent = req.headers['x-content-locale'];
  const fromBody = req.body?.contentLocale;
  const fromHeader = req.headers['x-ui-locale'];
  const fromBodyUi = req.body?.uiLocale;
  return normalizeContentLocale(fromContent || fromBody || fromHeader || fromBodyUi);
}

/** UI language for labels (expert list). Prefer X-UI-Locale over content locale. */
function resolveUiLocale(req) {
  const fromUi = req.headers['x-ui-locale'] || req.body?.uiLocale;
  const fromContent = req.headers['x-content-locale'] || req.body?.contentLocale;
  return normalizeContentLocale(fromUi || fromContent);
}

function dictionaryCacheHit(requestWord, contentLocale, cached) {
  if (!cached) return false;
  if (!isPayloadValidForContentLocale(contentLocale, cached)) return false;
  if (!isHeadwordValidForInput(requestWord, cached.headwordEn)) {
    console.warn(
      `[dict] cache skip: phrase "${requestWord}" stored as single keyword "${cached.headwordEn}"`,
    );
    return false;
  }
  return true;
}

async function generateDictionaryPayload(word, contentLocale) {
  const meta = dictionaryGenerationCacheMeta(contentLocale);
  const cached = await getCachedWordGeneration(word, meta);
  if (dictionaryCacheHit(word, contentLocale, cached)) {
    return { payload: cached, source: 'cache' };
  }

  return enqueueGigaChat(async () => {
    const cachedAfterWait = await getCachedWordGeneration(word, meta);
    if (dictionaryCacheHit(word, contentLocale, cachedAfterWait)) {
      return { payload: cachedAfterWait, source: 'cache' };
    }

    const generated = await generateWordExamples(word, { contentLocale });
    await saveCachedWordGeneration(word, generated, meta);
    if (
      generated.headwordEn &&
      normalizeWord(generated.headwordEn).toLowerCase() !== normalizeWord(word).toLowerCase() &&
      isHeadwordValidForInput(word, generated.headwordEn)
    ) {
      await saveCachedWordGeneration(generated.headwordEn, generated, meta);
    }
    return { payload: generated, source: 'gigachat' };
  }, {
    label: `dictionary:${word}:${meta.contentLocale}`,
  });
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
  let accessMode;
  try {
    const quota = await getPracticeQuotaStatus(req.vkUserId);
    accessMode = await assertPracticeAccess(req, res, quota);
    if (!accessMode) return;
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to check limits' });
  }

  const userText = normalizeWord(req.body?.userText ?? req.body?.text ?? '');
  if (!userText || userText.length > 4000) {
    return res.status(400).json({ error: 'Invalid text' });
  }
  const pol = assertAllowedUserContent(userText);
  if (!pol.ok) return res.status(400).json({ error: pol.error });
  const sessionIdRaw = req.body?.sessionId;
  const sessionId =
    sessionIdRaw != null && String(sessionIdRaw).trim() !== ''
      ? parseInt(String(sessionIdRaw), 10)
      : null;
  const contentLocale = resolveContentLocale(req);
  const clientHistory = Array.isArray(req.body?.history) ? req.body.history : null;
  try {
    const out = await enqueueGigaChat(
      () =>
        runFreePracticeTurn({
          vkUserId: req.vkUserId,
          userText,
          sessionId: Number.isFinite(sessionId) ? sessionId : null,
          contentLocale,
          clientHistory,
        }),
      {
        label: `practice:${req.vkUserId}`,
      },
    );
    if (accessMode === 'credits') {
      await chargePracticeCredit(req.vkUserId);
    }
    res.json({
      sessionId: out.sessionId,
      echo: out.echo,
      corrections: out.corrections,
      reply: out.reply,
      turns: out.turns,
    });
  } catch (e) {
    console.error(e);
    sendGenerationError(res, req, e);
  }
});

app.get('/api/practice/sessions', async (req, res) => {
  try {
    const modeRaw = String(req.query?.mode ?? '').trim();
    const mode = modeRaw === 'free' || modeRaw === 'expert' || modeRaw === 'word' ? modeRaw : undefined;
    const sessions = await listPracticeSessions(req.vkUserId, { mode });
    res.json({ sessions: sessions.map(mapPracticeSessionRow) });
  } catch (e) {
    console.error(e);
    respondDatabaseError(res, e);
  }
});

app.get('/api/practice/sessions/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  try {
    const bundle = await getPracticeSessionBundle(req.vkUserId, id);
    if (!bundle) return res.status(404).json({ error: 'Session not found' });
    res.json(bundle);
  } catch (e) {
    console.error(e);
    respondDatabaseError(res, e);
  }
});

app.get('/api/practice/experts', (req, res) => {
  res.json({ experts: listPracticeExpertsForUi(resolveUiLocale(req)) });
});

app.post('/api/practice/expert/turn', limitPractice, async (req, res) => {
  const rawText = String(req.body?.userText ?? req.body?.text ?? '').trim();
  const isStart = rawText === PRACTICE_EXPERT_START_MARKER;

  let accessMode = 'bypass';
  if (!isStart) {
    try {
      const quota = await getPracticeQuotaStatus(req.vkUserId);
      accessMode = await assertPracticeAccess(req, res, quota);
      if (!accessMode) return;
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to check limits' });
    }
  }

  const contentLocale = resolveContentLocale(req);
  const expertId = String(req.body?.expertId ?? req.body?.expertRole ?? '').trim();
  if (!isPracticeExpertId(expertId)) {
    return res.status(400).json({ error: 'Invalid expert role' });
  }
  if (!isStart && (!rawText || rawText.length > 4000)) {
    return res.status(400).json({ error: 'Invalid text' });
  }
  if (!isStart) {
    const pol = assertAllowedUserContent(rawText);
    if (!pol.ok) return res.status(400).json({ error: pol.error });
  }
  const userText = isStart ? PRACTICE_EXPERT_START_MARKER : rawText;
  const sessionIdRaw = req.body?.sessionId;
  const sessionId =
    sessionIdRaw != null && String(sessionIdRaw).trim() !== ''
      ? parseInt(String(sessionIdRaw), 10)
      : null;
  try {
    const out = await enqueueGigaChat(
      () =>
        runExpertPracticeTurn({
          vkUserId: req.vkUserId,
          userText,
          expertId,
          sessionId: Number.isFinite(sessionId) ? sessionId : null,
          contentLocale,
        }),
      {
        label: `practice-expert:${expertId}:${req.vkUserId}`,
      },
    );
    if (!isStart && accessMode === 'credits') {
      await chargePracticeCredit(req.vkUserId);
    }
    res.json({
      sessionId: out.sessionId,
      echo: out.echo,
      corrections: out.corrections,
      reply: out.reply,
      turns: out.turns,
    });
  } catch (e) {
    console.error(e);
    sendGenerationError(res, req, e);
  }
});

app.post('/api/practice/word/turn', limitPractice, async (req, res) => {
  const contentLocale = resolveContentLocale(req);

  const rawText = String(req.body?.userText ?? req.body?.text ?? '').trim();
  const isStart = rawText === PRACTICE_EXPERT_START_MARKER;

  let accessMode = 'bypass';
  if (!isStart) {
    try {
      const quota = await getPracticeQuotaStatus(req.vkUserId);
      accessMode = await assertPracticeAccess(req, res, quota);
      if (!accessMode) return;
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to check limits' });
    }
  }

  const wordId = parseInt(String(req.body?.wordId ?? ''), 10);
  if (!Number.isFinite(wordId) || wordId <= 0) {
    return res.status(400).json({ error: 'Invalid word id' });
  }
  if (!isStart && (!rawText || rawText.length > 4000)) {
    return res.status(400).json({ error: 'Invalid text' });
  }
  if (!isStart) {
    const pol = assertAllowedUserContent(rawText);
    if (!pol.ok) return res.status(400).json({ error: pol.error });
  }

  const userText = isStart ? PRACTICE_EXPERT_START_MARKER : rawText;
  const sessionIdRaw = req.body?.sessionId;
  const sessionId =
    sessionIdRaw != null && String(sessionIdRaw).trim() !== ''
      ? parseInt(String(sessionIdRaw), 10)
      : null;

  try {
    const out = await enqueueGigaChat(
      () =>
        runWordPracticeTurn({
          vkUserId: req.vkUserId,
          userText,
          wordId,
          sessionId: Number.isFinite(sessionId) ? sessionId : null,
          contentLocale,
        }),
      {
        label: `practice-word:${wordId}:${req.vkUserId}`,
      },
    );
    if (!isStart && accessMode === 'credits') {
      await chargePracticeCredit(req.vkUserId);
    }
    res.json({
      sessionId: out.sessionId,
      word: out.word,
      echo: out.echo,
      corrections: out.corrections,
      reply: out.reply,
      turns: out.turns,
    });
  } catch (e) {
    console.error(e);
    sendGenerationError(res, req, e);
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
    respondDatabaseError(res, e);
  }
});

// --- Сеты слов ---
app.get('/api/sets', async (req, res) => {
  try {
    const rows = await listSets(req.vkUserId);
    res.json({ sets: rows });
  } catch (e) {
    console.error(e);
    respondDatabaseError(res, e);
  }
});

app.post('/api/sets', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  const pol = assertAllowedUserContent(name);
  if (!pol.ok) return res.status(400).json({ error: pol.error });
  try {
    const created = await createSet(req.vkUserId, name);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    // unique violation
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'Set already exists' });
    }
    respondDatabaseError(res, e);
  }
});

app.patch('/api/sets/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  if (!name || name.length > 80) return res.status(400).json({ error: 'Invalid name' });
  const pol = assertAllowedUserContent(name);
  if (!pol.ok) return res.status(400).json({ error: pol.error });
  try {
    const updated = await renameSet(req.vkUserId, id, name);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    console.error(e);
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'Set already exists' });
    }
    respondDatabaseError(res, e);
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
    respondDatabaseError(res, e);
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
    respondDatabaseError(res, e);
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
    respondDatabaseError(res, e);
  }
});

async function handleRefreshExamples(req, res) {
  const accessMode = await assertRefreshAccess(req, res);
  if (!accessMode) return;
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
    const pol = assertAllowedUserContent(row.word);
    if (!pol.ok) return res.status(400).json({ error: pol.error });
    const contentLocale = resolveContentLocale(req);
    const previousTexts = (row.examples || []).map((ex) => ex.text).filter(Boolean);
    const generated = await enqueueGigaChat(
      () => generateWordExamples(row.word, { contentLocale, avoidExamples: previousTexts }),
      {
      label: `dictionary-refresh:${row.word}`,
    },
    );
    await saveCachedWordGeneration(
      row.word,
      generated,
      dictionaryGenerationCacheMeta(contentLocale),
      { variant: `refresh:${Date.now()}` },
    );
    const saved = await replaceExamplesForWord(req.vkUserId, id, generated);
    if (accessMode === 'credits') {
      await chargeRefreshCredit(req.vkUserId);
    }
    res.json(saved);
  } catch (e) {
    console.error(e);
    sendGenerationError(res, req, e);
  }
}

/** Два URL: короткий — для совместимости; длинный — как в REST. */
app.post('/api/refresh-examples', limitGeneration, handleRefreshExamples);
app.post('/api/words/:id/refresh-examples', limitGeneration, handleRefreshExamples);

app.post('/api/words', limitGeneration, async (req, res) => {
  let accessMode;
  try {
    const quota = await getWordsQuotaStatus(req.vkUserId);
    accessMode = await assertWordsAccess(req, res, quota);
    if (!accessMode) return;
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to check limits' });
  }

  const word = normalizeWord(req.body?.word);
  if (!word || word.length > 200) {
    return res.status(400).json({ error: 'Invalid word' });
  }
  const pol = assertAllowedUserContent(word);
  if (!pol.ok) return res.status(400).json({ error: pol.error });

  try {
    const contentLocale = resolveContentLocale(req);

    if (await findWordByLemma(req.vkUserId, word, contentLocale)) {
      return res.status(409).json({ error: 'Word already exists', existingWord: word, contentLocale });
    }

    if (!wordInputLooksEnglish(word, contentLocale)) {
      const previewLemma = normalizeWord(
        await enqueueGigaChat(() => resolveHeadwordEnQuick(word, contentLocale), {
          label: `headword-preview:${word}`,
        }),
      );
      if (previewLemma) {
        const existing = await findWordByLemma(req.vkUserId, previewLemma, contentLocale);
        if (existing) {
          return res.status(409).json({
            error: 'Word already exists',
            existingWord: previewLemma,
            contentLocale,
          });
        }
      }
    }

    console.log(
      `[dict] add word="${word}" contentLocale=${contentLocale} hdr=${req.headers['x-content-locale'] ?? '-'} body=${req.body?.contentLocale ?? '-'}`,
    );
    const { payload: generated, source } = await generateDictionaryPayload(word, contentLocale);
    const lemma = normalizeWord(generated.headwordEn);
    if (!lemma || lemma.length > 200) {
      return res.status(400).json({ error: 'Invalid word' });
    }
    const polLemma = assertAllowedUserContent(lemma);
    if (!polLemma.ok) return res.status(400).json({ error: polLemma.error });

    if (await findWordByLemma(req.vkUserId, lemma, contentLocale)) {
      return res.status(409).json({ error: 'Word already exists', existingWord: lemma, contentLocale });
    }

    const { headwordEn: _drop, ...payload } = generated;
    const saved = await insertWordWithExamples(req.vkUserId, lemma, payload, contentLocale);
    if (accessMode === 'credits') {
      await chargeWordCredit(req.vkUserId);
    }
    res.status(201).json({ ...saved, generationSource: source });
  } catch (e) {
    console.error(e);
    sendGenerationError(res, req, e);
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
    respondDatabaseError(res, e);
  }
});

async function start() {
  await initDb();
  logDictionaryPromptStartupInfo();
  if (
    String(process.env.NODE_ENV ?? '').toLowerCase() === 'production' &&
    !String(process.env.VK_APP_SECRET ?? '').trim() &&
    !String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  ) {
    console.warn(
      '[seashell] VK_APP_SECRET и TELEGRAM_BOT_TOKEN пусты — API доверяет только заголовку X-VK-User-Id.',
    );
  }
  const tgToken = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (tgToken) {
    console.log('[seashell] Telegram Mini App auth: enabled (TELEGRAM_BOT_TOKEN set)');
    console.log(
      `[seashell] Stars billing: subscription ${process.env.STARS_SUBSCRIPTION_AMOUNT ?? '145'} ⭐, webhook /api/telegram/webhook`,
    );
  }

  app.listen(PORT, '0.0.0.0', () => {
    const tls = process.env.GIGACHAT_TLS_INSECURE?.trim();
    const provider = resolveLlmProvider();
    const model = resolveLlmModel();
    console.log(`API: http://0.0.0.0:${PORT} (PORT=${process.env.PORT ?? 'default 3001'})`);
    console.log(`LLM: provider=${provider} (${llmProviderLabel()}) model=${model}`);
    if (provider === 'gigachat') {
      console.log(
        `GigaChat TLS relaxed (undici): ${tlsInsecure() ? 'yes' : 'no'} | NODE_ENV=${process.env.NODE_ENV ?? '(не задан)'} | GIGACHAT_TLS_INSECURE=${tls ?? '(unset)'}`,
      );
    }
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
