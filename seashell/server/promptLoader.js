import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPromptLocaleVars, normalizeContentLocale } from './promptLocales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const TEMPLATES_DIR = path.join(PROMPTS_DIR, 'templates');
const LOCALES_DIR = path.join(PROMPTS_DIR, 'locales');

function fillTemplate(raw, vars) {
  let out = String(raw);
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  return out;
}

/** Maps promptLocales camelCase fields to {{UPPER_SNAKE}} template placeholders. */
function templateVarsFromLocale(locale) {
  const v = getPromptLocaleVars(locale);
  return {
    LEARNER_L1: v.learnerL1,
    CORRECTIONS_LANGUAGE: v.correctionsLanguage,
    LAWFUL_SPEECH_BLOCK: v.lawfulSpeechBlock,
    LEARNER_AUDIENCE: v.learnerAudience,
    TRANSLATION_LANGUAGE: v.translationLanguage,
    INPUT_SCRIPT_NOTE: v.inputScriptNote,
    INPUT_SCRIPT_EXAMPLE: v.inputScriptExample,
    LEGAL_CONTENT_NOTE: v.legalContentNote,
    VERB_LABEL_PRESENT: v.verbLabelPresent,
    VERB_LABEL_PAST: v.verbLabelPast,
    VERB_LABEL_PARTICIPLE: v.verbLabelParticiple,
    TRANSLATION_SCRIPT: v.translationScript,
    TRANSLATION_SCRIPT_NOTE: v.translationScriptNote,
  };
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

function readLocaleFile(locale, name) {
  const code = normalizeContentLocale(locale);
  const localized = path.join(LOCALES_DIR, code, name);
  if (fs.existsSync(localized)) {
    return fs.readFileSync(localized, 'utf8');
  }
  const legacy = path.join(PROMPTS_DIR, name);
  if (fs.existsSync(legacy)) {
    return fs.readFileSync(legacy, 'utf8');
  }
  throw new Error(`Missing prompt file for locale ${code}: ${name}`);
}

/** User prompt for dictionary generation (word-examples). */
export function loadWordExamplesUserPrompt(locale) {
  return readLocaleFile(locale, 'word-examples.txt');
}

/** System prompt for dictionary generation. */
export function loadDictionarySystemPrompt(locale) {
  const raw = readLocaleFile(locale, 'word-dictionary-system.txt');
  return String(raw).trim();
}

export function loadDictionaryFormatSamples(locale) {
  return {
    formatSample: readLocaleFile(locale, 'word-dictionary-format-sample.json'),
    formatSampleVerb: readLocaleFile(locale, 'word-dictionary-format-sample-verb.json'),
  };
}

/** Practice turn user prompt template. */
export function loadPracticeTurnPrompt(locale) {
  return fillTemplate(readTemplate('practice-turn.template.txt'), templateVarsFromLocale(locale));
}

/** Expert practice turn user prompt (role substituted from practiceExperts). */
export function loadPracticeExpertTurnPrompt(locale, expert) {
  const vars = {
    ...templateVarsFromLocale(locale),
    EXPERT_ROLE_TITLE: expert.roleTitle,
    EXPERT_DOMAIN: expert.domain,
    EXPERT_STYLE: expert.style,
    SAMPLE_TOPICS: expert.sampleTopics,
    EXPERT_SAFEGUARDS: expert.safeguards
      ? `\nRole-specific rules:\n${expert.safeguards}\n`
      : '',
    START_MARKER: '__start__',
  };
  return fillTemplate(readTemplate('practice-expert-turn.template.txt'), vars);
}

/** Word-focused practice dialogue for one dictionary lemma. */
export function loadPracticeWordTurnPrompt(locale, { targetWord, wordGloss, wordExamplesBlock }) {
  const vars = {
    ...templateVarsFromLocale(locale),
    TARGET_WORD: targetWord,
    WORD_GLOSS: wordGloss || '(no gloss)',
    WORD_EXAMPLES_BLOCK: wordExamplesBlock || '(none)',
    START_MARKER: '__start__',
  };
  return fillTemplate(readTemplate('practice-word-turn.template.txt'), vars);
}

export function listPromptLocaleStatus() {
  const codes = fs.existsSync(LOCALES_DIR)
    ? fs.readdirSync(LOCALES_DIR).filter((d) => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory())
    : [];
  return { templatesDir: TEMPLATES_DIR, localeDirs: codes.sort() };
}
