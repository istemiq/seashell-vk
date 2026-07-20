/**
 * LLM-клиент: словарь, практика, неправильные глаголы (OpenRouter / DeepSeek).
 * Промпты в `server/prompts/`. Ответы парсятся в JSON.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import {
  englishLineFromItem,
  lineFromField,
  russianLineFromItem,
  stylisticNoteFromItem,
  splitTranslationTail,
  normalizeVerbUsage,
} from './exampleFields.js';
import { WORD_EXAMPLE_COUNT, IRREGULAR_VERB_EXAMPLES_PER_FORM } from './dictionaryConstants.js';
import {
  examplesOverlapRatio,
  refreshAvoidExamplesNote,
  refreshExamplesTemperature,
} from './dictionaryRefreshHelpers.js';
import {
  getInputModeRules,
  getPhraseEntryBanner,
  headwordQuickResolveSystemPrompt,
  isHeadwordValidForInput,
  isPhraseLikeInput,
  phraseInputRetryNote,
  assertHeadwordMatchesInputShape,
  wordInputLooksEnglish,
} from './dictionaryInputMode.js';
import { localeDictionaryRetryNote, normalizeContentLocale } from './promptLocales.js';
import { assertPayloadMatchesContentLocale } from './localeValidation.js';
import {
  loadDictionaryFormatSamples,
  loadDictionarySystemPrompt,
  loadPracticeExpertTurnPrompt,
  loadPracticeTurnPrompt,
  loadPracticeWordTurnPrompt,
  loadWordExamplesUserPrompt,
  loadIrregularVerbExamplesSingleFormPrompt,
  loadWordCustomExamplePrompt,
  listPromptLocaleStatus,
} from './promptLoader.js';
import {
  getPracticeExpert,
  PRACTICE_EXPERT_START_MARKER,
} from './practiceExperts.js';
import { sanitizePracticeEcho, sanitizeWordPracticeEcho, sanitizeWordPracticeCorrections } from './practiceEcho.js';
import { extractActiveThreadHint } from './practiceContext.js';
import { resolveLlmModel, resolveLlmProvider } from './llmProvider.js';
import { openRouterChatCompletion } from './openrouter.js';
import { deepSeekChatCompletion } from './deepseek.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Словарный промпт читается с диска на каждый запрос (без in-memory кэша),
 * чтобы правки в `prompts/*` применялись без перезапуска процесса.
 */
function getWordDictionaryUserPromptParts(contentLocale) {
  const locale = normalizeContentLocale(contentLocale);
  const { formatSample, formatSampleVerb } = loadDictionaryFormatSamples(locale);
  return {
    template: loadWordExamplesUserPrompt(locale),
    formatSample,
    formatSampleVerb,
  };
}

/** System-роль LLM для словаря. */
function buildDictionarySystemContent(contentLocale) {
  const locale = normalizeContentLocale(contentLocale);
  return String(loadDictionarySystemPrompt(locale))
    .trim()
    .replaceAll('{{WORD_EXAMPLE_COUNT}}', String(WORD_EXAMPLE_COUNT));
}

function fillPrompt(userInput, contentLocale) {
  const w = String(userInput).trim();
  const locale = normalizeContentLocale(contentLocale);
  const { template, formatSample, formatSampleVerb } = getWordDictionaryUserPromptParts(locale);
  return getPhraseEntryBanner(w) + template
    .replaceAll('{{INPUT}}', w)
    .replaceAll('{{WORD}}', w)
    .replaceAll('{{WORD_EXAMPLE_COUNT}}', String(WORD_EXAMPLE_COUNT))
    .replaceAll('{{INPUT_MODE_RULES}}', getInputModeRules(locale))
    .replaceAll('{{FORMAT_SAMPLE}}', formatSample.trim())
    .replaceAll('{{FORMAT_SAMPLE_VERB}}', formatSampleVerb.trim());
}

/** При старте API: пути и размеры файлов словарного промпта. */
export function logDictionaryPromptStartupInfo() {
  const { templatesDir, localeDirs } = listPromptLocaleStatus();
  console.log(`[seashell] dictionary prompt templates: ${path.resolve(templatesDir)}`);
  console.log(`[seashell] dictionary prompt locales: ${localeDirs.join(', ') || '(none)'}`);
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

export async function llmChatCompletion({ messages, temperature, max_tokens, top_p, repetition_penalty }) {
  const model = resolveLlmModel();
  const provider = resolveLlmProvider();
  if (provider === 'openrouter') {
    return openRouterChatCompletion({ model, messages, temperature, max_tokens, top_p });
  }
  if (provider === 'deepseek') {
    return deepSeekChatCompletion({ model, messages, temperature, max_tokens, top_p, repetition_penalty });
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}. Use openrouter or deepseek.`);
}

async function dictionaryLlmCompletion(userContent, temperature, contentLocale) {
  return llmChatCompletion({
    messages: [
      { role: 'system', content: buildDictionarySystemContent(contentLocale) },
      { role: 'user', content: userContent },
    ],
    temperature,
    max_tokens: 4000,
  });
}

/** Температура для генерации словаря: из .env или 0.38. */
function wordExamplesTemperature() {
  const raw = process.env.LLM_WORD_TEMPERATURE?.trim();
  if (!raw) return 0.38;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return 0.38;
  return Math.min(2, Math.max(0, n));
}

export async function generateWordExamples(word, { contentLocale, avoidExamples = [] } = {}) {
  const locale = normalizeContentLocale(contentLocale);
  const avoidList = Array.isArray(avoidExamples)
    ? avoidExamples.map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];
  const isRefresh = avoidList.length > 0;
  const userContent =
    fillPrompt(word, locale) + (isRefresh ? refreshAvoidExamplesNote(avoidList) : '');
  const baseTemperature = isRefresh
    ? refreshExamplesTemperature(wordExamplesTemperature())
    : wordExamplesTemperature();

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const retryNote =
      (attempt > 0 ? localeDictionaryRetryNote(locale) : '') + phraseInputRetryNote(word);
    const attemptTemperature = isRefresh
      ? Math.min(0.9, baseTemperature + attempt * 0.1)
      : attempt > 0
        ? Math.min(0.55, wordExamplesTemperature() + 0.08)
        : baseTemperature;
    const content = await dictionaryLlmCompletion(userContent + retryNote, attemptTemperature, locale);

    let payload;
    try {
      payload = extractGenerationPayload(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Ответ модели не разобрался как JSON (${msg}). Частые причины: в ответе есть markdown вместо чистого JSON, обрезан длинный ответ, или ошибка в структуре. Попробуй ещё раз.`,
      );
    }
    const { glossRu, examples, headwordEn: headFromPayload, verbUsage } = payload;

    if (examples.length < WORD_EXAMPLE_COUNT) {
      throw new Error(`Expected ${WORD_EXAMPLE_COUNT} examples, got ${examples.length}`);
    }

    const g = sanitizeGlossRu(glossRu);
    let headwordEn = typeof headFromPayload === 'string' ? headFromPayload.trim().replace(/\s+/g, ' ') : '';
    if (!headwordEn) {
      if (wordInputLooksEnglish(word, locale)) {
        headwordEn = String(word).trim().replace(/\s+/g, ' ');
      } else {
        throw new Error(
          'Модель не вернула английскую форму слова (headwordEn). Попробуй добавить ещё раз.',
        );
      }
    }

    const trimmed = examples.slice(0, WORD_EXAMPLE_COUNT);
    const glossOut = ensureGlossRuShowsEnglishLemma(word, headwordEn, g);
    const result = {
      glossRu: glossOut,
      glossNoteRu: null,
      examples: trimmed,
      headwordEn,
      verbUsage: Array.isArray(verbUsage) && verbUsage.length === 3 ? verbUsage : [],
    };

    try {
      assertHeadwordMatchesInputShape(word, headwordEn);
      assertPayloadMatchesContentLocale(locale, result);
      if (isRefresh) {
        const newTexts = trimmed.map((ex) => englishLineFromItem(ex));
        const overlap = examplesOverlapRatio(avoidList, newTexts);
        if (overlap >= 0.35) {
          lastErr = new Error(
            `Refresh examples too similar to previous set (${Math.round(overlap * 100)}% overlap)`,
          );
          console.warn(
            `[llm] dictionary refresh overlap ${locale}, attempt ${attempt + 1}/4`,
            lastErr.message,
          );
          continue;
        }
      }
      return result;
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] dictionary validation ${locale}, attempt ${attempt + 1}/4`, e?.message);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Wrong translation language from model');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exampleUsesHeadword(headword, text) {
  const hw = String(headword ?? '').trim();
  const en = String(text ?? '').trim();
  if (!hw || !en) return false;
  const parts = hw.split(/\s+/).filter(Boolean);
  return parts.every((part) => new RegExp(`\\b${escapeRegex(part)}\\w*\\b`, 'i').test(en));
}

const CUSTOM_EXAMPLE_SYSTEM_PROMPT =
  'You output only valid JSON when asked. No markdown fences. Single object with key "text" — one natural English sentence.';

/** Перевод родной фразы ученика в естественное английское предложение с headword. */
export async function generateCustomWordExample(headword, nativeText, { contentLocale } = {}) {
  const locale = normalizeContentLocale(contentLocale);
  const hw = String(headword ?? '').trim();
  const native = String(nativeText ?? '').trim();
  if (!hw || !native) {
    throw new Error('Invalid custom example input');
  }

  const userContent = loadWordCustomExamplePrompt(locale, { headword: hw, nativeText: native });
  let lastErr;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retryNote =
      attempt > 0
        ? '\n\nПредыдущий ответ не подошёл: нужен валидный JSON с ключом text — одно английское предложение, обязательно со словом «' +
          hw +
          '».'
        : '';
    const content = await llmChatCompletion({
      messages: [
        { role: 'system', content: CUSTOM_EXAMPLE_SYSTEM_PROMPT },
        { role: 'user', content: userContent + retryNote },
      ],
      temperature: Math.min(0.65, wordExamplesTemperature() + attempt * 0.08),
      max_tokens: 400,
    });

    try {
      const parsed = extractJsonObject(content);
      let text = englishLineFromItem(parsed);
      if (
        text &&
        looksMostlyCyrillic(text) &&
        !looksMostlyCyrillic(native) &&
        /[A-Za-z]{2,}/.test(native)
      ) {
        text = '';
      }
      if (!text || looksMostlyCyrillic(text)) {
        throw new Error('Model returned non-English text');
      }
      if (!exampleUsesHeadword(hw, text)) {
        throw new Error('Headword missing in custom example');
      }
      return { text: text.trim(), translation: native };
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] custom example ${locale}, attempt ${attempt + 1}/3`, e?.message);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Failed to generate custom example');
}

const IRREGULAR_FORM_KEYS = ['present', 'past_simple', 'past_participle'];

function normalizeIrregularExampleItem(item) {
  if (!item || typeof item !== 'object') return null;
  const form = String(item.form ?? '').trim();
  if (!IRREGULAR_FORM_KEYS.includes(form)) return null;
  let en = englishLineFromItem(item);
  let translation = russianLineFromItem(item);
  const sp = splitTranslationTail(translation);
  if (sp.noteRu) translation = sp.translation;
  if (!en) return null;
  return { form, en: en.trim(), translation: String(translation ?? '').trim() };
}

function extractIrregularExamplesPayload(text) {
  const t = text.trim();
  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object in model response');
    parsed = JSON.parse(t.slice(start, end + 1));
  }
  const arr = Array.isArray(parsed?.examples) ? parsed.examples : Array.isArray(parsed) ? parsed : [];
  return arr.map((item) => normalizeIrregularExampleItem(item)).filter(Boolean);
}

/** {{IRREGULAR_VERB_EXAMPLES_PER_FORM}} примеров одной формы неправильного глагола. */
async function generateIrregularVerbExamplesForForm(verb, formKey, { contentLocale } = {}) {
  const locale = normalizeContentLocale(contentLocale);
  const infinitive = String(verb?.infinitive ?? '').trim();
  const pastSimple = String(verb?.past_simple ?? '').trim();
  const pastParticiple = String(verb?.past_participle ?? '').trim();
  if (!infinitive || !pastSimple || !pastParticiple) {
    throw new Error('Invalid verb forms');
  }
  if (!IRREGULAR_FORM_KEYS.includes(formKey)) {
    throw new Error(`Invalid verb form: ${formKey}`);
  }

  const userContent = loadIrregularVerbExamplesSingleFormPrompt(locale, {
    INFINITIVE: infinitive,
    PAST_SIMPLE: pastSimple,
    PAST_PARTICIPLE: pastParticiple,
    FORM_KEY: formKey,
    EXAMPLES_PER_FORM: String(IRREGULAR_VERB_EXAMPLES_PER_FORM),
  });

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const retryNote = attempt > 0 ? localeDictionaryRetryNote(locale) : '';
    const content = await llmChatCompletion({
      messages: [
        { role: 'system', content: buildDictionarySystemContent(locale) },
        { role: 'user', content: userContent + retryNote },
      ],
      temperature:
        attempt > 0 ? Math.min(0.55, wordExamplesTemperature() + 0.08) : wordExamplesTemperature(),
      max_tokens: 4000,
    });

    let examples;
    try {
      examples = extractIrregularExamplesPayload(content).filter((ex) => ex.form === formKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Ответ модели не разобрался как JSON (${msg}).`);
    }

    if (examples.length < IRREGULAR_VERB_EXAMPLES_PER_FORM) {
      lastErr = new Error(
        `Expected ${IRREGULAR_VERB_EXAMPLES_PER_FORM} examples for ${formKey}, got ${examples.length}`,
      );
      continue;
    }

    const trimmed = examples.slice(0, IRREGULAR_VERB_EXAMPLES_PER_FORM);
    const payload = { examples: trimmed };
    try {
      assertPayloadMatchesContentLocale(locale, payload);
      return trimmed;
    } catch (e) {
      lastErr = e;
      console.warn(
        `[llm] irregular verb ${formKey} locale mismatch ${locale}, attempt ${attempt + 1}/4`,
        e?.message,
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Wrong translation language from model');
}

/** 30 примеров (10 × present / past_simple / past_participle) — три параллельных запроса к LLM. */
export async function generateIrregularVerbExamples(verb, { contentLocale } = {}) {
  const infinitive = String(verb?.infinitive ?? '').trim();
  if (!infinitive) throw new Error('Invalid verb forms');

  const startedAt = Date.now();
  const chunks = await Promise.all(
    IRREGULAR_FORM_KEYS.map((formKey) =>
      generateIrregularVerbExamplesForForm(verb, formKey, { contentLocale }),
    ),
  );
  console.log(
    `[llm] irregular verb ${infinitive}: parallel forms done in ${Date.now() - startedAt}ms`,
  );
  return { examples: chunks.flat() };
}

/** Быстро получить английский headword до полной генерации (проверка дубликатов). */
export async function resolveHeadwordEnQuick(word, contentLocale = 'en') {
  const w = String(word ?? '').trim().replace(/\s+/g, ' ');
  if (!w) return '';
  if (wordInputLooksEnglish(w, contentLocale)) return w;
  const isPhrase = isPhraseLikeInput(w);
  const content = await llmChatCompletion({
    messages: [
      {
        role: 'system',
        content: headwordQuickResolveSystemPrompt(isPhrase),
      },
      { role: 'user', content: w.slice(0, 200) },
    ],
    temperature: 0.1,
    max_tokens: 64,
  });
  try {
    const parsed = extractJsonObject(content);
    const hw = pickHeadwordEnFromParsed(parsed) || String(parsed?.headwordEn ?? '').trim();
    const normalized = hw.replace(/\s+/g, ' ');
    if (!isHeadwordValidForInput(w, normalized)) return '';
    return normalized;
  } catch {
    return '';
  }
}

export { wordInputLooksEnglish } from './dictionaryInputMode.js';

function buildPracticePrompt(userText, dialogueSummary, historyBlock, contentLocale) {
  const locale = normalizeContentLocale(contentLocale);
  const h = historyBlock ?? '(empty)';
  const summary = String(dialogueSummary ?? '').trim() || '(none yet)';
  const activeThread = extractActiveThreadHint(h);
  return loadPracticeTurnPrompt(locale)
    .replace('{{USER_TEXT}}', String(userText).trim().slice(0, 4000))
    .replace('{{HISTORY}}', h)
    .replace('{{DIALOGUE_SUMMARY}}', summary.slice(0, 900))
    .replace('{{ACTIVE_THREAD}}', activeThread);
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
export async function generatePracticeTurn({
  userText,
  dialogueSummary,
  historyBlock,
  history,
  contentLocale,
} = {}) {
  const locale = normalizeContentLocale(contentLocale);
  let block = historyBlock ?? '(empty)';
  let summary = dialogueSummary;
  if (block === '(empty)' && Array.isArray(history) && history.length) {
    const historyLines = history
      .filter((m) => m && typeof m.text === 'string')
      .slice(-28)
      .map((m) => ({
        role: m.role === 'assistant' ? 'Assistant' : 'User',
        text: m.text.slice(0, 1200),
      }));
    block =
      !historyLines.length
        ? '(empty)'
        : historyLines
            .map((m) => `${m.role}: ${m.text}`)
            .join('\n')
            .slice(0, 16000);
    summary = summary ?? '(none yet)';
  }
  const userContent = buildPracticePrompt(userText, summary, block, locale);

  const content = await llmChatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'You output only valid JSON when asked. No markdown fences. Keys: echo, corrections, reply. The "reply" must read like a sharp, natural native speaker in chat — specific, coherent with prior turns, not generic and not therapeutic. Never re-ask a premise the user already rejected or doubted.',
      },
      { role: 'user', content: userContent },
    ],
    temperature: 0.52,
    top_p: 0.92,
    max_tokens: 700,
    repetition_penalty: 1.06,
  });

  const raw = extractJsonObject(content);
  const turn = normalizePracticeTurn(raw);
  turn.echo = sanitizePracticeEcho(userText, turn.echo);
  return turn;
}

function buildPracticeExpertPrompt(userText, dialogueSummary, historyBlock, contentLocale, expertId) {
  const expert = getPracticeExpert(expertId);
  if (!expert) {
    throw new Error('Unknown expert role');
  }
  const h = historyBlock ?? '(empty)';
  const summary = String(dialogueSummary ?? '').trim() || '(none yet)';
  const activeThread = extractActiveThreadHint(h);
  return loadPracticeExpertTurnPrompt(contentLocale, expert)
    .replaceAll('{{USER_TEXT}}', String(userText).trim().slice(0, 4000))
    .replaceAll('{{HISTORY}}', h)
    .replaceAll('{{DIALOGUE_SUMMARY}}', summary.slice(0, 900))
    .replaceAll('{{ACTIVE_THREAD}}', activeThread);
}

const PRACTICE_EXPERT_SYSTEM_PROMPT =
  'You output only valid JSON when asked. No markdown fences. Keys: echo, corrections, reply. ' +
  '"reply" is always English at native conversational level (not slang). ' +
  '"corrections" gloss is in the learner L1 when provided. ' +
  'On session start (user message __start__), echo and corrections must be null; reply is the expert opening with a topic offer. ' +
  'Echo must restate the user line with typo fixes only — never invent a different question. Reply must address the Last user message, not a paraphrased echo. ' +
  'After the user accepts or engages with a topic, develop that thread — do not offer to switch topics every turn. ' +
  'Short user replies comment on your previous message; keep the same subject (names, examples) in view. ' +
  'You are an AI language-practice persona, not a licensed professional.';

/** Expert practice turn: role-play specialist for English practice (all content locales). */
export async function generatePracticeExpertTurn({
  userText,
  dialogueSummary,
  historyBlock,
  history,
  contentLocale,
  expertId,
} = {}) {
  const locale = normalizeContentLocale(contentLocale);
  let block = historyBlock;
  let summary = dialogueSummary;
  if (!block && Array.isArray(history)) {
    const historyLines = history
      .filter((m) => m && typeof m.text === 'string')
      .slice(-28)
      .map((m) => ({
        role: m.role === 'assistant' ? 'Assistant' : 'User',
        text: m.text.slice(0, 1200),
      }));
    block =
      !historyLines.length
        ? '(empty)'
        : historyLines
            .map((m) => `${m.role}: ${m.text}`)
            .join('\n')
            .slice(0, 16000);
    summary = summary ?? '(none yet)';
  }
  const userContent = buildPracticeExpertPrompt(userText, summary, block, locale, expertId);

  const content = await llmChatCompletion({
    messages: [
      { role: 'system', content: PRACTICE_EXPERT_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.48,
    top_p: 0.92,
    max_tokens: 900,
    repetition_penalty: 1.06,
  });

  const raw = extractJsonObject(content);
  const turn = normalizePracticeTurn(raw);
  if (String(userText).trim() === PRACTICE_EXPERT_START_MARKER) {
    return { echo: null, corrections: null, reply: turn.reply };
  }
  turn.echo = sanitizePracticeEcho(userText, turn.echo);
  return turn;
}

function formatWordExamplesBlock(examples) {
  if (!Array.isArray(examples) || !examples.length) return '(none)';
  return examples
    .slice(0, 3)
    .map((ex) => {
      const en = englishLineFromItem(ex);
      const ru = russianLineFromItem(ex);
      if (!en) return null;
      return ru ? `- ${en} — ${ru}` : `- ${en}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildPracticeWordPrompt(userText, dialogueSummary, historyBlock, contentLocale, wordMeta) {
  const locale = normalizeContentLocale(contentLocale);
  const h = historyBlock ?? '(empty)';
  const summary = String(dialogueSummary ?? '').trim() || '(none yet)';
  const lemma = String(wordMeta?.word ?? '').trim();
  const gloss = String(wordMeta?.gloss_ru ?? wordMeta?.glossRu ?? '').trim() || '(no gloss)';
  const examplesBlock = formatWordExamplesBlock(wordMeta?.examples);
  return loadPracticeWordTurnPrompt(locale, {
    targetWord: lemma,
    wordGloss: gloss,
    wordExamplesBlock: examplesBlock,
  })
    .replace('{{USER_TEXT}}', String(userText).trim().slice(0, 4000))
    .replace('{{HISTORY}}', h)
    .replace('{{DIALOGUE_SUMMARY}}', summary.slice(0, 900));
}

const PRACTICE_WORD_SYSTEM_PROMPT =
  'You output only valid JSON when asked. No markdown fences. Keys: echo, corrections, reply. ' +
  'Phrase practice: explain usage, ask the learner to say a sentence. ' +
  'Corrections: use when English is understandable but unnatural; suggest a natural line. null only if already native-sounding. ' +
  'Echo: light fixes only; keep the target phrase. Never swap the practiced phrase for a synonym in corrections. ' +
  'On session start (__start__), echo and corrections must be null.';

/** Word drill: short simple dialogue focused on one dictionary lemma. */
export async function generatePracticeWordTurn({
  userText,
  dialogueSummary,
  historyBlock,
  history,
  contentLocale,
  wordMeta,
} = {}) {
  const locale = normalizeContentLocale(contentLocale);
  let block = historyBlock;
  let summary = dialogueSummary;
  if (!block && Array.isArray(history)) {
    const historyLines = history
      .filter((m) => m && typeof m.text === 'string')
      .slice(-20)
      .map((m) => ({
        role: m.role === 'assistant' ? 'Assistant' : 'User',
        text: m.text.slice(0, 800),
      }));
    block =
      !historyLines.length
        ? '(empty)'
        : historyLines
            .map((m) => `${m.role}: ${m.text}`)
            .join('\n')
            .slice(0, 12000);
    summary = summary ?? '(none yet)';
  }
  const userContent = buildPracticeWordPrompt(userText, summary, block, locale, wordMeta);

  const content = await llmChatCompletion({
    messages: [
      { role: 'system', content: PRACTICE_WORD_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.48,
    top_p: 0.9,
    max_tokens: 550,
    repetition_penalty: 1.06,
  });

  const raw = extractJsonObject(content);
  const turn = normalizePracticeTurn(raw);
  if (String(userText).trim() === PRACTICE_EXPERT_START_MARKER) {
    return { echo: null, corrections: null, reply: turn.reply };
  }
  const targetLemma = String(wordMeta?.word ?? '').trim();
  turn.echo = sanitizeWordPracticeEcho(userText, turn.echo, targetLemma);
  turn.corrections = sanitizeWordPracticeCorrections(userText, turn.corrections, targetLemma);
  return turn;
}
