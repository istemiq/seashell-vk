/** UI locales that have dedicated GigaChat prompt packs (mirror of frontend UI_LOCALES). */
export const CONTENT_LOCALE_CODES = new Set([
  'ru',
  'en',
  'ar',
  'es',
  'pt',
  'fa',
  'uk',
  'ko',
  'ja',
  'it',
  'tr',
]);

/** Fallback when the client does not send X-UI-Locale (legacy VK). TG sends the header explicitly. */
export const DEFAULT_CONTENT_LOCALE = 'ru';

export function normalizeContentLocale(code) {
  const c = String(code ?? '').trim().toLowerCase();
  return CONTENT_LOCALE_CODES.has(c) ? c : DEFAULT_CONTENT_LOCALE;
}

/**
 * Substitution values for prompt templates in `prompts/templates/`.
 * Russian pack is the reference; other locales mirror structure and rules.
 */
export const PROMPT_LOCALE_VARS = {
  ru: {
    learnerAudience: 'русскоязычным ученикам английского',
    translationLanguage: 'русский',
    inputScriptNote: 'кириллицей',
    inputScriptExample: 'по-русски',
    legalContentNote:
      'Контент: законный учебный тон для РФ, 16+, без экстремизма, ненависти, оскорблений религий, сексуального контента с несовершеннолетними, инструкций по преступлениям и наркотикам; без мата.',
    verbLabelPresent: 'наст. (go)',
    verbLabelPast: 'прош. (went)',
    verbLabelParticiple: 'прич. (gone)',
    translationScript: 'Cyrillic',
    translationScriptNote:
      'Cyrillic for the main gloss/translation of that same English sentence',
    learnerL1: 'Russian speaker',
    correctionsLanguage: 'Russian',
    lawfulSpeechBlock: `Russia / lawful speech (mini-app distributed in RU, audience 16+):
- Do not produce echo, corrections, or reply that insult religious confessions, clergy, sacred objects, or believers; do not incite hatred or enmity toward groups; do not undermine family or minors through content that could qualify as prohibited propaganda under applicable Russian law; no extremism; no sexual content involving minors; no instructions for crimes.
- Refuse politely (same JSON shape) if the user pushes for any of the above; do not debate the law—stay brief and redirect to safe English practice.`,
  },
  en: {
    learnerAudience: 'English-speaking learners of English',
    translationLanguage: 'English',
    inputScriptNote: 'in a non-Latin script or another language',
    inputScriptExample: 'in their native language',
    legalContentNote:
      'Content: lawful educational tone, 16+, no extremism, hate, harassment, sexual content involving minors, crime or drug instructions; no profanity.',
    verbLabelPresent: 'pres. (go)',
    verbLabelPast: 'past (went)',
    verbLabelParticiple: 'pp. (gone)',
    translationScript: 'Latin',
    translationScriptNote: 'English for the main gloss/translation of that same English sentence',
    learnerL1: 'English speaker',
    correctionsLanguage: 'English',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  es: {
    learnerAudience: 'estudiantes hispanohablantes de inglés',
    translationLanguage: 'español',
    inputScriptNote: 'en cirílico u otro alfabeto',
    inputScriptExample: 'en español',
    legalContentNote:
      'Contenido: tono educativo lícito, 16+, sin extremismo, odio, contenido sexual con menores, instrucciones de delitos o drogas; sin groserías.',
    verbLabelPresent: 'pres. (go)',
    verbLabelPast: 'pret. (went)',
    verbLabelParticiple: 'part. (gone)',
    translationScript: 'Latin',
    translationScriptNote: 'Spanish for the main gloss/translation of that same English sentence',
    learnerL1: 'Spanish speaker',
    correctionsLanguage: 'Spanish',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  pt: {
    learnerAudience: 'estudantes lusófonos de inglês',
    translationLanguage: 'português',
    inputScriptNote: 'em cirílico ou outro alfabeto',
    inputScriptExample: 'em português',
    legalContentNote:
      'Conteúdo: tom educativo lícito, 16+, sem extremismo, ódio, conteúdo sexual com menores, instruções de crimes ou drogas; sem palavrões.',
    verbLabelPresent: 'pres. (go)',
    verbLabelPast: 'pret. (went)',
    verbLabelParticiple: 'part. (gone)',
    translationScript: 'Latin',
    translationScriptNote: 'Portuguese for the main gloss/translation of that same English sentence',
    learnerL1: 'Portuguese speaker',
    correctionsLanguage: 'Portuguese',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  it: {
    learnerAudience: 'studenti italofoni di inglese',
    translationLanguage: 'italiano',
    inputScriptNote: 'in cirillico o altro alfabeto',
    inputScriptExample: 'in italiano',
    legalContentNote:
      'Contenuto: tono educativo lecito, 16+, senza estremismo, odio, contenuti sessuali con minori, istruzioni per reati o droghe; senza volgarità.',
    verbLabelPresent: 'pres. (go)',
    verbLabelPast: 'pass. (went)',
    verbLabelParticiple: 'part. (gone)',
    translationScript: 'Latin',
    translationScriptNote: 'Italian for the main gloss/translation of that same English sentence',
    learnerL1: 'Italian speaker',
    correctionsLanguage: 'Italian',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  uk: {
    learnerAudience: 'україномовним учням англійської',
    translationLanguage: 'українська',
    inputScriptNote: 'кирилицею',
    inputScriptExample: 'українською',
    legalContentNote:
      'Контент: законний навчальний тон, 16+, без екстремізму, ненависті, сексуального контенту з неповнолітніми, інструкцій щодо злочинів і наркотиків; без лайки.',
    verbLabelPresent: 'теп. (go)',
    verbLabelPast: 'мин. (went)',
    verbLabelParticiple: 'дієпр. (gone)',
    translationScript: 'Cyrillic',
    translationScriptNote: 'Ukrainian (Cyrillic) for the main gloss/translation of that same English sentence',
    learnerL1: 'Ukrainian speaker',
    correctionsLanguage: 'Ukrainian',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  ar: {
    learnerAudience: 'متعلمي الإنجليزية الناطقين بالعربية',
    translationLanguage: 'العربية',
    inputScriptNote: 'بالسيريلية أو أبجدية أخرى',
    inputScriptExample: 'بالعربية',
    legalContentNote:
      'المحتوى: نبرة تعليمية مشروعة، 16+، بلا تطرف أو كراهية أو محتوى جنسي يشمل قاصرين أو تعليمات جرائم أو مخدرات؛ بلا ألفاظ بذيئة.',
    verbLabelPresent: 'مضارع (go)',
    verbLabelPast: 'ماضٍ (went)',
    verbLabelParticiple: 'تصريف ثالث (gone)',
    translationScript: 'Arabic',
    translationScriptNote: 'Arabic for the main gloss/translation of that same English sentence',
    learnerL1: 'Arabic speaker',
    correctionsLanguage: 'Arabic',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  fa: {
    learnerAudience: 'زبان‌آموزان انگلیسی فارسی‌زبان',
    translationLanguage: 'فارسی',
    inputScriptNote: 'با سیریلیک یا الفبای دیگر',
    inputScriptExample: 'به فارسی',
    legalContentNote:
      'محتوا: لحن آموزشی قانونی، ۱۶+، بدون افراط‌گرایی، نفرت، محتوای جنسی با افراد زیر سن قانونی، دستورالعمل جرم یا مواد مخدر؛ بدون فحش.',
    verbLabelPresent: 'حال (go)',
    verbLabelPast: 'گذشته (went)',
    verbLabelParticiple: 'گذشته نقلی (gone)',
    translationScript: 'Persian',
    translationScriptNote: 'Persian for the main gloss/translation of that same English sentence',
    learnerL1: 'Persian speaker',
    correctionsLanguage: 'Persian',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  ko: {
    learnerAudience: '한국어 사용자 영어 학습자',
    translationLanguage: '한국어',
    inputScriptNote: '키릴 문자 등 다른 문자로',
    inputScriptExample: '한국어로',
    legalContentNote:
      '콘텐츠: 합법적 학습 톤, 16세 이상, 극단주의·혐오·미성년자 성적 내용·범죄·마약 지시 금지; 욕설 금지.',
    verbLabelPresent: '현재 (go)',
    verbLabelPast: '과거 (went)',
    verbLabelParticiple: '과거분사 (gone)',
    translationScript: 'Korean',
    translationScriptNote: 'Korean for the main gloss/translation of that same English sentence',
    learnerL1: 'Korean speaker',
    correctionsLanguage: 'Korean',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  tr: {
    learnerAudience: 'İngilizce öğrenen Türkçe konuşan öğrenciler',
    translationLanguage: 'Türkçe',
    inputScriptNote: 'Kiril veya başka alfabe ile',
    inputScriptExample: 'Türkçe olarak',
    legalContentNote:
      'İçerik: yasal eğitim tonu, 16+, aşırılık, nefret, reşit olmayanlarla cinsel içerik, suç veya uyuşturucu talimatı yok; küfür yok.',
    verbLabelPresent: 'şimd. (go)',
    verbLabelPast: 'geçmiş (went)',
    verbLabelParticiple: 'part. (gone)',
    translationScript: 'Latin',
    translationScriptNote: 'Turkish for the main gloss/translation of that same English sentence',
    learnerL1: 'Turkish speaker',
    correctionsLanguage: 'Turkish',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
  ja: {
    learnerAudience: '日本語話者の英語学習者',
    translationLanguage: '日本語',
    inputScriptNote: 'キリル文字など別表記で',
    inputScriptExample: '日本語で',
    legalContentNote:
      '内容：合法的な学習トーン、16歳以上、過激主義・憎悪・未成年の性的内容・犯罪・薬物の指示なし；卑語なし。',
    verbLabelPresent: '現在 (go)',
    verbLabelPast: '過去 (went)',
    verbLabelParticiple: '過去分詞 (gone)',
    translationScript: 'Japanese',
    translationScriptNote: 'Japanese for the main gloss/translation of that same English sentence',
    learnerL1: 'Japanese speaker',
    correctionsLanguage: 'Japanese',
    lawfulSpeechBlock: `General safety (audience 16+):
- Do not produce echo, corrections, or reply that promote hate, violence, extremism, sexual content involving minors, or instructions for crimes or illegal drugs.
- Refuse politely (same JSON shape) if the user pushes for harmful content; stay brief and redirect to safe English practice.`,
  },
};

export function getPromptLocaleVars(locale) {
  const code = normalizeContentLocale(locale);
  return PROMPT_LOCALE_VARS[code];
}

/** Extra user-message tail on dictionary retries when locale validation failed. */
export function localeDictionaryRetryNote(locale) {
  const code = normalizeContentLocale(locale);
  const lang = PROMPT_LOCALE_VARS[code]?.translationLanguage ?? code;
  if (code === 'ru' || code === 'uk') {
    return `\n\nREMINDER: translations and gloss meaning MUST be in ${lang} (Cyrillic). No English-only glosses.`;
  }
  if (code === 'ar' || code === 'fa') {
    return `\n\nREMINDER: translations and gloss meaning MUST be in ${lang} (Arabic script). NO Russian/Cyrillic.`;
  }
  if (code === 'ko' || code === 'ja') {
    const lang = code === 'ja' ? 'Japanese (kanji/kana)' : 'Korean (Hangul)';
    return `\n\nREMINDER: translations and glossRu meaning MUST be in ${lang}. NO Russian/Cyrillic anywhere in translation or gloss meaning.`;
  }
  return `\n\nREMINDER: translations and gloss meaning MUST be in ${lang} only. NO Russian/Cyrillic in translation or glossRu. If the learner entered a phrase (2+ words), headwordEn must be the full English translation of that phrase — never reduce to one keyword.`;
}
