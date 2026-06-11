/**
 * Локальная фильтрация пользовательского текста до вызова GigaChat:
 * грубая ненормативная лексика, оскорбительные маркеры (в т.ч. непоследовательные ответы модели).
 * Не заменяет юридическую экспертизу; промпты дополнительно задают рамки для модели.
 */

const MSG_RU =
  'Такая формулировка не подходит для учебного приложения (ненормативная лексика или недопустимый контент). Выберите другое слово или перефразируйте.';

/** Латиница: с границы слова — покрывает fuck, fuckwit, motherfucking и т.п. */
const EN_PATTERNS = [
  /\bfuck/i,
  /\bshit/i,
  /\bcunt/i,
  /\b(slut|whore|bitch|bastard|twat|wank|piss\w*|jerkoff|jackoff)\b/i,
  /\b(nigger|nigga|faggot|chink|spic|kike)\b/i,
  /\b(dick|cock)\b/i,
  /\bcum\b/i,
  /\brape\b/i,
  /\bnazi\b/i,
  /\bhitler\b/i,
];

/** Кириллица: по подстрокам (грубый фильтр). */
const RU_SUBSTR = [
  'хуй',
  'хуя',
  'хуе',
  'хуи',
  'пизд',
  'бляд',
  'ебат',
  'ёбан',
  'ебуч',
  'ебан',
  'сука',
  'пидор',
  'пидр',
  'гондон',
  'мразь',
  'ублюд',
];

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text — слово для словаря, фраза практики, название группы и т.п.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertAllowedUserContent(text) {
  const t = fold(text);
  if (!t) return { ok: true };

  for (const re of EN_PATTERNS) {
    if (re.test(t)) {
      return { ok: false, error: MSG_RU };
    }
  }
  for (const sub of RU_SUBSTR) {
    if (t.includes(sub)) {
      return { ok: false, error: MSG_RU };
    }
  }
  return { ok: true };
}
