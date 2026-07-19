import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractActiveThreadHint } from '../practiceContext.js';
import {
  getPracticeExpert,
  listPracticeExpertsForUi,
  PRACTICE_EXPERTS,
} from '../practiceExperts.js';
import { loadPracticeExpertTurnPrompt } from '../promptLoader.js';
import {
  CONTENT_LOCALE_CODES,
  getPromptLocaleVars,
  normalizeContentLocale,
} from '../promptLocales.js';

const LOCALES = [...CONTENT_LOCALE_CODES].sort();

const SAMPLE_HISTORY = [
  'User: Was he joking?',
  'Assistant: Ah, the Socratic irony! No, he was not joking — it was his method of exposing gaps.',
  'User: Usually people get mad',
].join('\n');

/** Mirrors llmClient buildPracticeExpertPrompt substitution. */
function buildFullExpertPrompt(locale, expert, opts = {}) {
  const history = opts.history ?? SAMPLE_HISTORY;
  let prompt = loadPracticeExpertTurnPrompt(locale, expert);
  return prompt
    .replaceAll('{{USER_TEXT}}', opts.userText ?? 'Usually people get mad')
    .replaceAll('{{HISTORY}}', history)
    .replaceAll('{{DIALOGUE_SUMMARY}}', opts.summary ?? 'Discussing Socrates and Socratic irony.')
    .replaceAll('{{ACTIVE_THREAD}}', extractActiveThreadHint(history));
}

const RUNTIME_PLACEHOLDERS = new Set(['USER_TEXT', 'HISTORY', 'DIALOGUE_SUMMARY', 'ACTIVE_THREAD']);

function assertNoUnresolvedPlaceholders(prompt, label) {
  const leftovers = prompt.match(/\{\{[A-Z0-9_]+\}\}/g);
  assert.equal(
    leftovers,
    null,
    `${label}: unresolved placeholders: ${leftovers?.join(', ')}`,
  );
}

function assertTemplatePlaceholdersResolved(prompt, label) {
  const leftovers = prompt.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
  const bad = leftovers.filter((p) => !RUNTIME_PLACEHOLDERS.has(p.slice(2, -2)));
  assert.equal(bad.length, 0, `${label}: unresolved template vars: ${bad.join(', ')}`);
}

describe('practice expert prompts — all locales', () => {
  for (const locale of LOCALES) {
    describe(`locale: ${locale}`, () => {
      const vars = getPromptLocaleVars(locale);

      it('loads philosopher prompt with locale-specific corrections language', () => {
        const expert = getPracticeExpert('philosopher');
        const prompt = loadPracticeExpertTurnPrompt(locale, expert);
        assertTemplatePlaceholdersResolved(prompt, `philosopher/${locale} (partial)`);
        assert.match(prompt, /Philosopher/);
        assert.match(prompt, /PHASE C hard bans/i);
        assert.match(prompt, /Active thread/i);
        assert.match(prompt, new RegExp(vars.correctionsLanguage, 'i'));
        assert.match(prompt, new RegExp(vars.learnerL1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      });

      it('builds full turn prompt with active thread from history', () => {
        const expert = getPracticeExpert('philosopher');
        const prompt = buildFullExpertPrompt(locale, expert);
        assertNoUnresolvedPlaceholders(prompt, `philosopher/${locale} (full)`);
        assert.match(prompt, /Socratic irony/i);
        assert.match(prompt, /Usually people get mad/);
        assert.match(prompt, /Do NOT pivot to a different school/i);
      });

      it('psychologist safeguards present in every locale', () => {
        const expert = getPracticeExpert('psychologist');
        const prompt = loadPracticeExpertTurnPrompt(locale, expert);
        assert.match(prompt, /NOT a therapist/i);
        assertTemplatePlaceholdersResolved(prompt, `psychologist/${locale}`);
      });

      it('religious expert safeguards present in every locale', () => {
        const expert = getPracticeExpert('muslim_tradition');
        const prompt = loadPracticeExpertTurnPrompt(locale, expert);
        assert.match(prompt, /NOT clergy/i);
        assertTemplatePlaceholdersResolved(prompt, `muslim_tradition/${locale}`);
      });

      it('expert list UI titles: ru Cyrillic vs others English roleTitle', () => {
        const list = listPracticeExpertsForUi(locale);
        assert.equal(list.length, Object.keys(PRACTICE_EXPERTS).length);
        const philosopher = list.find((e) => e.id === 'philosopher');
        assert.ok(philosopher?.roleTitle);
        if (locale === 'ru') {
          assert.match(philosopher.title, /Философ/);
        } else {
          assert.equal(philosopher.title, philosopher.roleTitle);
          assert.doesNotMatch(philosopher.title, /[А-Яа-яЁё]/);
        }
      });
    });
  }

  it('normalizeContentLocale falls back unknown codes to ru', () => {
    assert.equal(normalizeContentLocale('xx'), 'ru');
    assert.equal(normalizeContentLocale('uk'), 'uk');
  });

  it('every expert id produces a valid prompt for uk and tr', () => {
    for (const id of Object.keys(PRACTICE_EXPERTS)) {
      for (const locale of ['uk', 'tr', 'ja']) {
        const expert = getPracticeExpert(id);
        const prompt = buildFullExpertPrompt(locale, expert);
        assertNoUnresolvedPlaceholders(prompt, `${id}/${locale}`);
        assert.match(prompt, new RegExp(expert.roleTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  });
});
