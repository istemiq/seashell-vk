/**
 * Нормализация полей из JSON ответа GigaChat для словаря.
 * Иногда модель кладёт вложенный объект вместо строки — вытаскиваем текст из вложенных ключей.
 * Используется в `db.js` при вставке примеров и в `gigachat.js` при разборе массива примеров.
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
