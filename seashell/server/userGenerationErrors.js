import { normalizeContentLocale } from './promptLocales.js';

const MSGS = {
  ru: {
    llm_unavailable: 'Сервис генерации временно недоступен. Попробуйте через несколько минут.',
    llm_payment: 'Сервис генерации временно недоступен. Попробуйте позже.',
  },
  en: {
    llm_unavailable: 'Generation is temporarily unavailable. Try again in a few minutes.',
    llm_payment: 'Generation is temporarily unavailable. Please try again later.',
  },
  uk: {
    llm_unavailable: 'Сервіс генерації тимчасово недоступний. Спробуйте через кілька хвилин.',
    llm_payment: 'Сервіс генерації тимчасово недоступний. Спробуйте пізніше.',
  },
  tr: {
    llm_unavailable: 'Üretim hizmeti geçici olarak kullanılamıyor. Birkaç dakika sonra tekrar deneyin.',
    llm_payment: 'Üretim hizmeti geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
  },
};

function msg(locale, key) {
  const loc = normalizeContentLocale(locale);
  const pack = MSGS[loc] || MSGS.en;
  return pack[key] || MSGS.en[key] || MSGS.en.llm_unavailable;
}

/** Classify LLM/provider failure for user-facing copy (not logs). */
export function classifyGenerationError(e) {
  const text = String(e?.message ?? e ?? '').toLowerCase();
  if (
    text.includes('402') ||
    text.includes('payment required') ||
    text.includes('insufficient credits') ||
    text.includes('quota')
  ) {
    return 'llm_payment';
  }
  if (
    text.includes('403') ||
    text.includes('security policy') ||
    text.includes('openrouter') ||
    text.includes('deepseek') ||
    text.includes('gigachat') ||
    text.includes('empty gigachat') ||
    text.includes('empty openrouter')
  ) {
    return 'llm_unavailable';
  }
  return 'llm_unavailable';
}

/** Localized message for dictionary/practice generation failures. */
export function generationUserMessage(e, locale = 'ru') {
  const code = classifyGenerationError(e);
  return { error: msg(locale, code), code };
}

/** Generic client message in production; details only in logs. */
export function generationErrorMessage(e, fallback = 'Generation failed') {
  const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (isProd) return fallback;
  return e?.message || fallback;
}
