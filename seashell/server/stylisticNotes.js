import { normalizeContentLocale } from './promptLocales.js';
import { splitTranslationTail } from './exampleFields.js';

const REPLACEMENTS_BY_LOCALE = {
  en: [
    [/нейтр\.?/gi, 'neutral'],
    [/разг\.?/gi, 'informal'],
    [/розм\.?/gi, 'informal'],
    [/форм\.?/gi, 'formal'],
  ],
  es: [
    [/нейтр\.?/gi, 'neutro'],
    [/разг\.?/gi, 'coloq.'],
    [/розм\.?/gi, 'coloq.'],
    [/форм\.?/gi, 'formal'],
  ],
  pt: [
    [/нейтр\.?/gi, 'neutro'],
    [/разг\.?/gi, 'informal'],
    [/розм\.?/gi, 'informal'],
    [/форм\.?/gi, 'formal'],
  ],
  it: [
    [/нейтр\.?/gi, 'neutro'],
    [/разг\.?/gi, 'colloq.'],
    [/розм\.?/gi, 'colloq.'],
    [/форм\.?/gi, 'formale'],
  ],
  tr: [
    [/нейтр\.?/gi, 'nötr'],
    [/разг\.?/gi, 'argo'],
    [/розм\.?/gi, 'argo'],
    [/форм\.?/gi, 'resmi'],
  ],
  ar: [
    [/нейтр\.?/gi, 'محايد'],
    [/разг\.?/gi, 'عامية'],
    [/розм\.?/gi, 'عامية'],
    [/форм\.?/gi, 'رسمي'],
  ],
  fa: [
    [/нейтр\.?/gi, 'خنثی'],
    [/разг\.?/gi, 'محاوره‌ای'],
    [/розм\.?/gi, 'محاوره‌ای'],
    [/форм\.?/gi, 'رسمی'],
  ],
  ko: [
    [/нейтр\.?/gi, '중립'],
    [/разг\.?/gi, '구어'],
    [/розм\.?/gi, '구어'],
    [/форм\.?/gi, '격식'],
  ],
  ja: [
    [/нейтр\.?/gi, '中立'],
    [/разг\.?/gi, '口語'],
    [/розм\.?/gi, '口語'],
    [/форм\.?/gi, '格式'],
  ],
};

/** Заменяет русские сокращения стиля на язык карточки; BrE/AmE сохраняет. */
export function localizeStylisticNote(note, contentLocale) {
  const raw = String(note ?? '').trim();
  if (!raw) return '';
  const loc = normalizeContentLocale(contentLocale);
  if (loc === 'ru' || loc === 'uk') return raw;
  if (!/[\u0400-\u04FF]/.test(raw)) return raw;

  let out = raw;
  const rules = REPLACEMENTS_BY_LOCALE[loc] ?? REPLACEMENTS_BY_LOCALE.en;
  for (const [re, replacement] of rules) {
    out = out.replace(re, replacement);
  }
  return out.replace(/\s*;\s*/g, '; ').trim();
}

/** Отделяет хвост стиля и локализует его для языка карточки. */
export function formatExampleTranslationForLocale(translation, contentLocale) {
  const raw = String(translation ?? '').trim();
  if (!raw) return '';
  const { translation: base, noteRu } = splitTranslationTail(raw);
  const note = localizeStylisticNote(noteRu, contentLocale);
  if (!note) return base.trim();
  return `${base.trim()} — ${note}`;
}
