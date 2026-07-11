import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPracticeLlmContext, applyClientHistoryFallback, extractActiveThreadHint, formatMessagesForSummary } from '../practiceContext.js';
import { loadPracticeTurnPrompt } from '../promptLoader.js';
import { normalizeContentLocale } from '../promptLocales.js';

describe('practiceContext', () => {
  it('builds summary plus recent verbatim lines', () => {
    const rows = [
      { is_opening: true, reply: 'Hi, want to talk about sleep?' },
      { is_opening: false, user_text: 'Yes please', echo: 'Yes, please', corrections: null, reply: 'Great — why sleep matters…' },
      { is_opening: false, user_text: 'Tell me more', echo: 'Tell me more', corrections: null, reply: 'Sure, REM is…' },
    ];
    const ctx = buildPracticeLlmContext(rows, 'User agreed to discuss sleep.');
    assert.match(ctx.summary, /sleep/i);
    assert.ok(ctx.historyBlock.includes('Yes please'));
    assert.ok(ctx.historyBlock.includes('REM'));
  });

  it('formats folded rows for summary prompt', () => {
    const text = formatMessagesForSummary([
      { is_opening: false, user_text: 'Hi', echo: 'Hi', reply: 'Hello there' },
    ]);
    assert.match(text, /User: Hi/);
    assert.match(text, /Assistant: Hello there/);
  });

  it('extracts last assistant line as active thread hint', () => {
    const block = [
      'User: Was he joking?',
      'Assistant: Ah, the Socratic irony! No, he was not joking.',
      'User: Usually people get mad',
    ].join('\n');
    const hint = extractActiveThreadHint(block);
    assert.match(hint, /Socratic irony/i);
  });

  it('applyClientHistoryFallback uses client history when DB context is empty', () => {
    const empty = buildPracticeLlmContext([], '(none yet)');
    assert.equal(empty.historyBlock, '(empty)');
    const merged = applyClientHistoryFallback(empty, [
      { role: 'user', text: 'I doubt innate traits exist' },
      { role: 'assistant', text: 'Interesting — what makes you doubt that?' },
    ]);
    assert.match(merged.historyBlock, /innate traits/i);
    assert.match(merged.historyBlock, /Interesting/);
  });

  it('free practice prompt template includes active thread placeholder', () => {
    const prompt = loadPracticeTurnPrompt(normalizeContentLocale('en'));
    assert.match(prompt, /\{\{ACTIVE_THREAD\}\}/);
    assert.match(prompt, /innate traits/i);
  });
});
