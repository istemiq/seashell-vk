import { normalizeContentLocale } from './promptLocales.js';

/** Фраза/предложение: 2+ слова или знаки вопроса/восклицания. */
export function isPhraseLikeInput(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return false;
  if (/[?!…]/.test(s)) return true;
  return s.split(' ').filter(Boolean).length >= 2;
}

/** Для фразового ввода headwordEn тоже должен быть фразой, не одним словарным словом. */
export function isHeadwordValidForInput(userInput, headwordEn) {
  if (!isPhraseLikeInput(userInput)) return true;
  const hw = String(headwordEn ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!hw) return false;
  return isPhraseLikeInput(hw);
}

export function assertHeadwordMatchesInputShape(userInput, headwordEn) {
  if (!isHeadwordValidForInput(userInput, headwordEn)) {
    const hw = String(headwordEn ?? '').trim();
    throw new Error(
      `Model reduced phrase input to a single keyword (${hw || '?'}). headwordEn must be a full English translation of the whole entry.`,
    );
  }
}

export function phraseInputRetryNote(userInput) {
  if (!isPhraseLikeInput(userInput)) return '';
  const sample = String(userInput ?? '').trim();
  return (
    `\n\nCRITICAL PHRASE INPUT («${sample}»): headwordEn MUST be the full natural English translation ` +
    '(several words). Examples: «Ben doctorum» → «I am a doctor», «Ben müşterim» → «I am a customer». ' +
    'Returning only one keyword like «doctor» or «customer» is WRONG.'
  );
}

export function getPhraseEntryBanner(userInput) {
  if (!isPhraseLikeInput(userInput)) return '';
  const sample = String(userInput ?? '').trim();
  return `**PHRASE ENTRY** («${sample}»): translate/adapt the **entire** learner input; headwordEn must be a multi-word English phrase, not one keyword.\n\n`;
}

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

/**
 * Можно ли считать ввод готовой английской леммой без вызова модели (дубликаты, fallback).
 * Фразы и ввод при contentLocale ≠ en всегда требуют перевода/адаптации.
 */
export function wordInputLooksEnglish(word, contentLocale = 'en') {
  if (isPhraseLikeInput(word)) return false;
  const loc = normalizeContentLocale(contentLocale);
  if (loc !== 'en') return false;
  return looksMostlyEnglish(word);
}

const INPUT_MODE_RULES = {
  ru: `**Ввод ученика (слово или фраза — сохраняй смысл целиком)**
- Не своди фразу к одному ключевому слову.
- **Одно слово** (напр. «словарь», «doktor») — \`headwordEn\` = естественная английская **лемма** (напр. \`dictionary\`, \`doctor\`).
- **Фраза или предложение** (2+ слова, напр. «Я врач», «Ben doctorum») — \`headwordEn\` = **полный естественный английский перевод всей записи** (напр. \`I am a doctor\`), **не** одно слово \`doctor\`. Примеры в \`text\` учат эту английскую фразу (или её естественные грамматические формы).
- В \`glossRu\`: латиницей \`headwordEn\`, IPA, затем **русское** толкование; можно кратко указать исходный ввод в скобках. **Не** начинай \`glossRu\` с русского ввода без английского \`headwordEn\`.`,

  uk: `**Ввід учня (слово або фраза — зберігай сенс цілком)**
- Не зводь фразу до одного ключового слова.
- **Одне слово** — \`headwordEn\` = природна англійська **лема**.
- **Фраза або речення** (2+ слова) — \`headwordEn\` = **повний природний англійський переклад усього вводу**, не одне ключове слово. Приклади в \`text\` вчиють цю англійську фразу.
- У \`glossRu\`: \`headwordEn\` + IPA + **українське** тлумачення; можна вказати вихідний ввід у дужках.`,

  tr: `**Öğrenci girdisi (kelime veya ifade — anlamı bütün olarak koru)**
- İfadeyi tek anahtar kelimeye indirgeme.
- **Tek kelime** (ör. «sözlük», «doktor») — \`headwordEn\` = doğal İngilizce **lemma** (ör. \`dictionary\`, \`doctor\`).
- **İfade veya cümle** (2+ kelime, ör. «Ben doctorum», «Ben bir doktorum») — \`headwordEn\` = **tüm girdinin doğal İngilizce çevirisi** (ör. \`I am a doctor\`), **\`doctor\` gibi tek kelime değil**. \`text\` örnekleri bu İngilizce ifadeyi öğretmeli.
- \`glossRu\`: \`headwordEn\` + IPA + **Türkçe** anlam; öğrencinin girdisini parantezde belirtebilirsin. \`glossRu\`'yu yalnızca Türkçe girdiyle başlatma.`,

  es: `**Entrada del alumno (palabra o frase — conserva el sentido completo)**
- No reduzcas una frase a una sola palabra clave.
- **Una palabra** — \`headwordEn\` = **lema** inglesa natural.
- **Frase u oración** (2+ palabras, ej. «Soy médico») — \`headwordEn\` = **traducción inglesa natural de toda la entrada** (ej. \`I am a doctor\`), no solo \`doctor\`. Los \`text\` enseñan esa frase en inglés.
- \`glossRu\`: \`headwordEn\` + IPA + significado en **español**; puedes citar la entrada original entre paréntesis.`,

  pt: `**Entrada do aluno (palavra ou frase — preserve o sentido inteiro)**
- Não reduza uma frase a uma única palavra-chave.
- **Uma palavra** — \`headwordEn\` = **lema** inglesa natural.
- **Frase ou oração** (2+ palavras) — \`headwordEn\` = **tradução inglesa natural de toda a entrada**, não uma só palavra. Os \`text\` ensinam essa frase em inglês.
- \`glossRu\`: \`headwordEn\` + IPA + significado em **português**.`,

  it: `**Input dell'allievo (parola o frase — mantieni il senso intero)**
- Non ridurre una frase a una sola parola chiave.
- **Una parola** — \`headwordEn\` = **lemma** inglese naturale.
- **Frase o periodo** (2+ parole) — \`headwordEn\` = **traduzione inglese naturale dell'intero input**, non una sola parola. I \`text\` insegnano quella frase in inglese.
- \`glossRu\`: \`headwordEn\` + IPA + significato in **italiano**.`,

  en: `**Learner entry (word or phrase — keep the full meaning)**
- Do not reduce a phrase to a single keyword.
- **Single word** — \`headwordEn\` = natural English **lemma** (or the word itself if already English).
- **Phrase or sentence** (2+ words, e.g. \`I am a doctor\`) — \`headwordEn\` = **natural English equivalent of the whole entry** (normalize grammar if needed), not one extracted keyword. \`text\` examples must teach that English phrase.
- \`glossRu\`: \`headwordEn\` + IPA + **English** definition/gloss.`,

  ar: `**مدخل المتعلم (كلمة أو عبارة — احفظ المعنى كاملاً)**
- لا تُختزل العبارة إلى كلمة مفتاحية واحدة.
- **كلمة واحدة** — \`headwordEn\` = **لفظ إنجليزي** طبيعي (lemma).
- **عبارة أو جملة** (كلمتان فأكثر) — \`headwordEn\` = **الترجمة الإنجليزية الطبيعية للمدخل كاملاً**، وليس كلمة واحدة مستخرجة. أمثلة \`text\` تعلّم هذه العبارة الإنجليزية.
- \`glossRu\`: \`headwordEn\` + IPA + المعنى **بالعربية**.`,

  fa: `**ورودی زبان‌آموز (کلمه یا عبارت — معنای کامل را حفظ کن)**
- عبارت را به یک کلمه کلیدی کاهش نده.
- **یک کلمه** — \`headwordEn\` = **لفظ انگلیسی** طبیعی.
- **عبارت یا جمله** (۲+ کلمه) — \`headwordEn\` = **ترجمهٔ طبیعی انگلیسی کل ورودی**، نه یک کلمه. مثال‌های \`text\` همان عبارت انگلیسی را آموزش می‌دهند.
- \`glossRu\`: \`headwordEn\` + IPA + معنی **فارسی**.`,

  ja: `**学習者の入力（単語またはフレーズ — 意味全体を保持）**
- フレーズを1語のキーワードに落とさない。
- **単語1つ** — \`headwordEn\` = 自然な英語の**見出し語（lemma）**。
- **フレーズ・文**（2語以上）— \`headwordEn\` = **入力全体の自然な英語訳**（例：「私は医者です」→ \`I am a doctor\`）。\`doctor\` だけにしない。\`text\` はその英語フレーズを教える。
- \`glossRu\`: \`headwordEn\` + IPA + **日本語**の意味。`,

  ko: `**학습자 입력(단어 또는 구문 — 의미 전체 유지)**
- 구문을 하나의 키워드로 축소하지 말 것.
- **단어 하나** — \`headwordEn\` = 자연스러운 영어 **표제어**.
- **구문·문장**(2단어 이상) — \`headwordEn\` = **입력 전체의 자연스러운 영어 번역**, 한 단어로 추출 금지. \`text\` 예문은 그 영어 구문을 가르침.
- \`glossRu\`: \`headwordEn\` + IPA + **한국어** 뜻.`,
};

export function getInputModeRules(contentLocale) {
  const code = normalizeContentLocale(contentLocale);
  return INPUT_MODE_RULES[code] ?? INPUT_MODE_RULES.en;
}

export function headwordQuickResolveSystemPrompt(isPhrase) {
  if (isPhrase) {
    return (
      'Output only valid JSON: {"headwordEn":"..."} — natural English translation of the ENTIRE learner ' +
      'phrase/sentence. Preserve full meaning. Do NOT reduce to a single dictionary keyword. No markdown.'
    );
  }
  return (
    'Output only valid JSON: {"headwordEn":"..."} — natural English dictionary lemma for the single-word ' +
    'learner input. No markdown.'
  );
}
