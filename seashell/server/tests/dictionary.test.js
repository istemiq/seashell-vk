import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  englishLineFromItem,
  lineFromField,
  normalizeVerbUsage,
  russianLineFromItem,
  splitTranslationTail,
} from '../exampleFields.js';
import { isPhraseLikeInput, isHeadwordValidForInput, wordInputLooksEnglish } from '../dictionaryInputMode.js';
import { isPayloadValidForContentLocale } from '../localeValidation.js';

describe('dictionary exampleFields', () => {
  it('lineFromField extracts nested English text', () => {
    assert.equal(lineFromField({ text: { en: '  hello  ' } }), 'hello');
    assert.equal(lineFromField({ sentence: 'Take a break' }), 'Take a break');
  });

  it('englishLineFromItem prefers text over translation keys', () => {
    assert.equal(englishLineFromItem('  run  '), 'run');
    assert.equal(
      englishLineFromItem({ text: 'She runs daily', translation: 'Она бегает каждый день' }),
      'She runs daily',
    );
  });

  it('russianLineFromItem reads translation fields', () => {
    assert.equal(russianLineFromItem('plain string'), '');
    assert.equal(
      russianLineFromItem({ text: 'book', translation: 'книга' }),
      'книга',
    );
  });

  it('splitTranslationTail moves register hint into noteRu', () => {
    assert.deepEqual(splitTranslationTail('книга (разг.)'), {
      translation: 'книга',
      noteRu: 'разг.',
    });
    assert.deepEqual(splitTranslationTail('книга'), {
      translation: 'книга',
      noteRu: '',
    });
  });

  it('normalizeVerbUsage keeps exactly three verb forms', () => {
    const forms = normalizeVerbUsage([
      { label: 'V1', text: 'go', translation: 'идти' },
      { label: 'V2', text: 'went', translation: 'шёл' },
      { label: 'V3', text: 'gone', translation: 'ушедший' },
      { label: 'extra', text: 'x', translation: 'y' },
    ]);
    assert.equal(forms.length, 3);
    assert.equal(forms[0].text, 'go');
    assert.equal(forms[2].translation, 'ушедший');
  });

  it('normalizeVerbUsage swaps fields when model swapped EN/RU', () => {
    const forms = normalizeVerbUsage([
      { label: 'V1', text: 'идти', translation: 'go' },
      { label: 'V2', text: 'шёл', translation: 'went' },
      { label: 'V3', text: 'ушедший', translation: 'gone' },
    ]);
    assert.equal(forms[0].text, 'go');
    assert.equal(forms[0].translation, 'идти');
  });
});

describe('dictionary locale validation', () => {
  const ruPayload = {
    glossRu: 'dictionary [ˈdɪkʃənri] — словарь',
    examples: [{ translation: 'Открой словарь — open the dictionary' }],
  };

  const trPayload = {
    glossRu: 'dictionary [ˈdɪkʃənri] — sözlük',
    examples: [{ translation: 'Sözlüğü aç — open the dictionary' }],
  };

  const leakedRussianIntoTr = {
    glossRu: 'dictionary — словарь',
    examples: [{ translation: 'Открой словарь' }],
  };

  const allLatinRu = {
    glossRu: 'dictionary — book of words',
    examples: [{ translation: 'Open the dictionary please' }],
  };

  it('accepts Russian gloss and translations for ru locale', () => {
    assert.equal(isPayloadValidForContentLocale('ru', ruPayload), true);
  });

  it('accepts Turkish gloss and translations for tr locale', () => {
    assert.equal(isPayloadValidForContentLocale('tr', trPayload), true);
  });

  it('rejects Cyrillic leak in tr locale', () => {
    assert.equal(isPayloadValidForContentLocale('tr', leakedRussianIntoTr), false);
  });

  it('rejects all-Latin example translations for ru locale', () => {
    assert.equal(isPayloadValidForContentLocale('ru', allLatinRu), false);
  });

  it('allows same English headword payloads for different content locales independently', () => {
    assert.equal(isPayloadValidForContentLocale('ru', ruPayload), true);
    assert.equal(isPayloadValidForContentLocale('tr', trPayload), true);
    assert.equal(isPayloadValidForContentLocale('tr', ruPayload), false);
    assert.equal(isPayloadValidForContentLocale('ru', trPayload), false);
  });

  it('validates Japanese translations', () => {
    const jaPayload = {
      glossRu: 'dictionary [ˈdɪkʃənri] — 辞書',
      examples: [{ translation: '辞書を開いてください' }],
    };
    const jaLeak = {
      glossRu: 'dictionary — word list only in English without any CJK',
      examples: [{ translation: 'Please open the dictionary now' }],
    };
    assert.equal(isPayloadValidForContentLocale('ja', jaPayload), true);
    assert.equal(isPayloadValidForContentLocale('ja', jaLeak), false);
  });
});

describe('dictionary learner input mode', () => {
  it('treats multi-word entries as phrases', () => {
    assert.equal(isPhraseLikeInput('Ben doctorum'), true);
    assert.equal(isPhraseLikeInput('doctor'), false);
    assert.equal(isPhraseLikeInput('I am a doctor'), true);
  });

  it('does not treat Turkish phrase as ready-made English lemma', () => {
    assert.equal(wordInputLooksEnglish('Ben doctorum', 'tr'), false);
    assert.equal(wordInputLooksEnglish('Ben doctorum', 'en'), false);
    assert.equal(wordInputLooksEnglish('doctor', 'en'), true);
    assert.equal(wordInputLooksEnglish('doctor', 'tr'), false);
  });

  it('rejects single-keyword headword for phrase input', () => {
    assert.equal(isHeadwordValidForInput('Ben doctorum', 'doctor'), false);
    assert.equal(isHeadwordValidForInput('Ben müşterim', 'customer'), false);
    assert.equal(isHeadwordValidForInput('Ben müşterim', 'I am a customer'), true);
    assert.equal(isHeadwordValidForInput('doktor', 'doctor'), true);
  });
});
