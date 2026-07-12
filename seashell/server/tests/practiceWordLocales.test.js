import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadPracticeWordTurnPrompt } from '../promptLoader.js';
import { CONTENT_LOCALE_CODES, getPromptLocaleVars } from '../promptLocales.js';

const LOCALES = [...CONTENT_LOCALE_CODES].sort();

describe('practice word prompts — all locales', () => {
  for (const locale of LOCALES) {
    it(`loads word drill prompt for ${locale}`, () => {
      const vars = getPromptLocaleVars(locale);
      const prompt = loadPracticeWordTurnPrompt(locale, {
        targetWord: 'fertile',
        wordGloss: 'sample gloss',
        wordExamplesBlock: '- The soil is fertile.',
      });
      assert.match(prompt, /fertile/i);
      assert.match(prompt, /phrase practice/i);
      assert.match(prompt, /sample gloss/);
      assert.match(prompt, new RegExp(vars.correctionsLanguage, 'i'));
      assert.match(prompt, new RegExp(vars.learnerL1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      const leftovers = prompt.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
      const bad = leftovers.filter(
        (p) => !['{{USER_TEXT}}', '{{HISTORY}}', '{{DIALOGUE_SUMMARY}}'].includes(p),
      );
      assert.equal(bad.length, 0, `unresolved placeholders: ${bad.join(', ')}`);
    });
  }
});
