/** Сколько примеров храним и показываем на слово (промпт, LLM, БД). */
export const WORD_EXAMPLE_COUNT = 10;

/** Сколько пользовательских примеров можно добавить к одной карточке. */
export const MAX_CUSTOM_EXAMPLES = 50;

/** Три формы неправильного глагола в карточке (verbUsage). */
export const VERB_USAGE_COUNT = 3;

/** Примеров на одну форму глагола в разделе «Неправильные глаголы». */
export const IRREGULAR_VERB_EXAMPLES_PER_FORM = 10;

/** Сколько примеров генерируем за один запрос к LLM (3 формы × 10). */
export const IRREGULAR_VERB_EXAMPLES_BATCH_COUNT =
  IRREGULAR_VERB_EXAMPLES_PER_FORM * VERB_USAGE_COUNT;
