/**
 * Нормализация полей из JSON ответа LLM для словаря.
 * Иногда модель кладёт вложенный объект вместо строки — вытаскиваем текст из вложенных ключей.
 * Используется в `db.js` при вставке примеров и в `llmClient.js` при разборе массива примеров.
 */
export function lineFromField(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object') {
    const nested =
      val.text ??
      val.en ??
      val.english ??
      val.sentence ??
      val.example ??
      val.phrase ??
      val.content ??
      val.original ??
      val.line ??
      val.utterance ??
      val.ru ??
      val.translation;
    if (nested !== undefined && nested !== val) return lineFromField(nested);
  }
  return '';
}

/** Английская строка из элемента массива примеров (плоский объект или строка). */
export function englishLineFromItem(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item !== 'object') return '';
  return lineFromField(
    item.text ??
      item.en ??
      item.english ??
      item.sentence ??
      item.example ??
      item.phrase ??
      item.content ??
      item.original ??
      item.line ??
      item.utterance,
  );
}

/** Русская строка из элемента массива примеров. */
export function russianLineFromItem(item) {
  if (item == null || typeof item === 'string') return '';
  if (typeof item !== 'object') return '';
  return lineFromField(
    item.translation ?? item.ru ?? item.ru_translation ?? item.russian ?? item.meaning,
  );
}

/** Стилистика / регион (отдельное поле в JSON и в БД). */
export function stylisticNoteFromItem(item) {
  if (item == null || typeof item === 'string') return '';
  if (typeof item !== 'object') return '';
  return lineFromField(
    item.noteRu ??
      item.note_ru ??
      item.styleRu ??
      item.style_ru ??
      item.register_ru ??
      item.register ??
      item.hintRu ??
      '',
  );
}

/**
 * Старый формат: весь комментарий в конце translation в скобках — отделяем для note_ru.
 * @returns {{ translation: string, noteRu: string }}
 */
/** Короткая подпись формы глагола (label в verbUsage). */
export function labelFromVerbUsageItem(item) {
  if (item == null || typeof item !== 'object') return '';
  return lineFromField(
    item.label ?? item.form ?? item.formRu ?? item.form_ru ?? item.tag ?? item.name,
  );
}

/** Нормализует один элемент verbUsage к { label, text, translation }. */
export function normalizeVerbUsageItem(item) {
  if (!item || typeof item !== 'object') return null;
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
  const label = labelFromVerbUsageItem(item);
  const sp = splitTranslationTail(translation);
  translation = sp.noteRu ? sp.translation : translation;
  if (!text || !translation) return null;
  return {
    label: label || '',
    text: String(text).trim(),
    translation: String(translation).trim(),
  };
}

/** @param {unknown} arr */
export function normalizeVerbUsage(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    const n = normalizeVerbUsageItem(item);
    if (n) out.push(n);
    if (out.length >= 3) break;
  }
  return out.length === 3 ? out : [];
}

function looksMostlyCyrillic(s) {
  const t = String(s ?? '');
  const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  return cyr > lat;
}

export function splitTranslationTail(translation) {
  const raw = String(translation ?? '').trim();
  if (!raw) return { translation: '', noteRu: '' };

  const paren = raw.match(/^(.+?)\s*[\(\（]([^)\）]+)[\)\）]\s*$/);
  if (paren) {
    const base = paren[1].trim();
    const note = paren[2].trim();
    if (base) return { translation: base, noteRu: note };
  }

  const dash = raw.match(/^(.+?)\s+[—–]\s+(.+)$/);
  if (dash) {
    const base = dash[1].trim();
    const note = dash[2].trim();
    if (base) return { translation: base, noteRu: note };
  }

  return { translation: raw, noteRu: '' };
}
