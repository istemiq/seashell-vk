import { normalizeContentLocale } from './promptLocales.js';

/** Локали, где перевод/gloss должны быть латиницей (не кириллица). */
const LATIN_GLOSS_LOCALES = new Set(['tr', 'es', 'pt', 'it', 'en']);

function scriptCounts(s) {
  const t = String(s ?? '');
  let latin = 0;
  let cyr = 0;
  let arabic = 0;
  let cjk = 0;
  for (const ch of t) {
    if (/[A-Za-z\u00C0-\u024F\u0300-\u036F]/.test(ch)) latin += 1;
    if (/[\u0400-\u04FF]/.test(ch)) cyr += 1;
    if (/[\u0600-\u06FF]/.test(ch)) arabic += 1;
    if (/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uFF66-\uFF9F]/.test(ch)) cjk += 1;
  }
  return { latin, cyr, arabic, cjk };
}

function glossMeaningPart(glossRu) {
  const g = String(glossRu ?? '');
  for (const sep of ['—', '–', '－', '；', ';']) {
    const i = g.indexOf(sep);
    if (i !== -1) return g.slice(i + 1);
  }
  return g;
}

function translationMainLine(translation) {
  const t = String(translation ?? '');
  for (const sep of ['—', '–', '－']) {
    const i = t.indexOf(sep);
    if (i !== -1) return t.slice(0, i);
  }
  return t;
}

function cjkLocaleOk(loc, { latin, cyr, cjk }) {
  if (cyr > 0) return false;
  if (cjk >= 2) return true;
  // Короткая строка или хвост с латиницей (BrE) — не отбрасываем
  if (latin <= 24) return true;
  return false;
}

/**
 * @param {string} locale
 * @param {{ glossRu?: string | null, examples?: Array<{ translation?: string }> }} payload
 */
export function isPayloadValidForContentLocale(locale, payload) {
  const loc = normalizeContentLocale(locale);
  const examples = Array.isArray(payload?.examples) ? payload.examples : [];

  for (const ex of examples) {
    const main = translationMainLine(ex?.translation);
    const counts = scriptCounts(main);
    if (loc === 'ru' && counts.latin > counts.cyr * 2 && counts.cyr === 0) return false;
    if (loc === 'uk' && counts.latin > counts.cyr * 2 && counts.cyr === 0) return false;
    if (LATIN_GLOSS_LOCALES.has(loc) && counts.cyr > 0) return false;
    if (loc === 'ar' || loc === 'fa') {
      if (counts.cyr > 0) return false;
      if (counts.arabic === 0 && counts.latin > 8) return false;
    }
    if ((loc === 'ko' || loc === 'ja') && !cjkLocaleOk(loc, counts)) return false;
  }

  const glossMain = glossMeaningPart(payload?.glossRu);
  const g = scriptCounts(glossMain);
  if (LATIN_GLOSS_LOCALES.has(loc) && g.cyr > 0) return false;
  if ((loc === 'ar' || loc === 'fa') && g.cyr > 0) return false;
  if (loc === 'ko' || loc === 'ja') {
    if (g.cyr > 0) return false;
    if (g.cjk === 0 && g.latin > 24) return false;
  }

  return true;
}

export function assertPayloadMatchesContentLocale(locale, payload) {
  if (!isPayloadValidForContentLocale(locale, payload)) {
    throw new Error(`Model returned wrong language for locale ${normalizeContentLocale(locale)}`);
  }
}
