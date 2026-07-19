import { llmChatCompletion } from './llmClient.js';
import { formatMessagesForSummary } from './practiceContext.js';
import { PRACTICE_MAX_SUMMARY_CHARS } from './practiceConstants.js';

/**
 * Fold pruned / older turns into a short English summary (cheap side-call).
 */
export async function updatePracticeDialogueSummary({
  previousSummary,
  foldedMessages,
  mode,
  expertId,
  targetWord,
}) {
  const folded = formatMessagesForSummary(foldedMessages);
  if (!folded.trim()) {
    return String(previousSummary ?? '').trim().slice(0, PRACTICE_MAX_SUMMARY_CHARS);
  }

  const roleHint =
    mode === 'expert' && expertId
      ? `Expert chat (${expertId}).`
      : mode === 'word' && targetWord
        ? `Word drill (word id ${targetWord}).`
        : 'Free English conversation practice.';

  const content = `You compress chat logs for an English-learning app. ${roleHint}

Write 2–3 VERY short English sentences (max 70 words total). Include only:
- main topic(s) discussed
- key names, figures, or concepts currently active (e.g. Socrates, Socratic irony)
- what the user agreed to or declined
- any user preference stated
- positions or premises the user explicitly rejected or doubts (must not be re-asked)
- current thread if obvious

Do NOT add advice, moralizing, or new facts. Plain text only.

Previous summary (merge and shorten; drop stale details):
"""
${String(previousSummary ?? '').trim() || '(none)'}
"""

New lines to fold in:
"""
${folded.slice(0, 4000)}
"""`;

  const out = await llmChatCompletion({
    messages: [
      {
        role: 'system',
        content: 'You output plain text only. No markdown, no JSON, no bullet lists.',
      },
      { role: 'user', content: content },
    ],
    temperature: 0.15,
    max_tokens: 140,
  });

  const summary = String(out ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .slice(0, PRACTICE_MAX_SUMMARY_CHARS);

  return summary || String(previousSummary ?? '').trim().slice(0, PRACTICE_MAX_SUMMARY_CHARS);
}
