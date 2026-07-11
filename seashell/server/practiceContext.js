import {
  PRACTICE_MAX_RECENT_HISTORY_CHARS,
  PRACTICE_MAX_STORED_TURNS,
  PRACTICE_RECENT_MESSAGES_FOR_LLM,
} from './practiceConstants.js';

/** DB rows → UI turn objects. */
export function practiceRowsToTurns(rows) {
  return rows.map((row) => ({
    opening: Boolean(row.is_opening),
    userText: row.is_opening ? null : row.user_text,
    echo: row.is_opening ? null : row.echo,
    corrections: row.is_opening ? null : row.corrections,
    reply: row.reply,
    seq: row.seq,
  }));
}

/** Format pruned or recent rows as plain text for summary prompt. */
export function formatMessagesForSummary(rows) {
  return rows
    .map((row) => {
      if (row.is_opening) {
        return `Assistant: ${row.reply}`;
      }
      const userLine = row.user_text ? `User: ${row.user_text}` : '';
      const echoLine = row.echo && row.echo !== row.user_text ? ` (heard: ${row.echo})` : '';
      const assistant = `Assistant: ${row.reply}`;
      return [userLine ? `${userLine}${echoLine}` : null, assistant].filter(Boolean).join('\n');
    })
    .join('\n');
}

/**
 * Build LLM history lines from DB messages: recent verbatim only.
 * @returns {{ summary: string, historyLines: Array<{role: string, text: string}> }}
 */
export function buildPracticeLlmContext(messages, dialogueSummary) {
  const summary = String(dialogueSummary ?? '').trim() || '(none yet)';

  const llmLines = [];
  for (const row of messages) {
    if (row.is_opening) {
      llmLines.push({ role: 'assistant', text: String(row.reply).slice(0, 1200) });
      continue;
    }
    if (row.user_text) {
      llmLines.push({ role: 'user', text: String(row.user_text).slice(0, 1200) });
    }
    if (row.reply) {
      llmLines.push({ role: 'assistant', text: String(row.reply).slice(0, 1200) });
    }
  }

  const recent = llmLines.slice(-PRACTICE_RECENT_MESSAGES_FOR_LLM);
  const historyLines = recent.map((m) => ({
    role: m.role === 'assistant' ? 'Assistant' : 'User',
    text: m.text,
  }));

  let block = !historyLines.length
    ? '(empty)'
    : historyLines.map((m) => `${m.role}: ${m.text}`).join('\n');
  block = block.slice(0, PRACTICE_MAX_RECENT_HISTORY_CHARS);

  return { summary, historyLines, historyBlock: block };
}

/** Legacy client history → internal lines (fallback when no session). */
export function normalizeClientHistory(historyRaw) {
  return (Array.isArray(historyRaw) ? historyRaw : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-PRACTICE_MAX_STORED_TURNS * 2)
    .map((m) => ({
      role: m.role === 'assistant' ? 'Assistant' : 'User',
      text: m.text.slice(0, 1200),
    }));
}

export function clientHistoryToBlock(historyLines) {
  if (!historyLines?.length) return '(empty)';
  return historyLines
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, PRACTICE_MAX_RECENT_HISTORY_CHARS);
}

/** Use client-sent history when the DB session has no messages yet (legacy clients). */
export function applyClientHistoryFallback(ctx, clientHistory) {
  if (ctx.historyBlock !== '(empty)' || !Array.isArray(clientHistory) || !clientHistory.length) {
    return ctx;
  }
  const lines = normalizeClientHistory(clientHistory);
  if (!lines.length) return ctx;
  const recent = lines.slice(-PRACTICE_RECENT_MESSAGES_FOR_LLM);
  return {
    summary: ctx.summary,
    historyLines: recent,
    historyBlock: clientHistoryToBlock(recent),
  };
}

/** Last assistant line from a history block — anchor for short user follow-ups. */
export function extractActiveThreadHint(historyBlock) {
  const block = String(historyBlock ?? '').trim();
  if (!block || block === '(empty)') return '(none)';
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith('Assistant:')) {
      const text = line.slice('Assistant:'.length).trim();
      return text.slice(0, 500) || '(none)';
    }
  }
  return '(none)';
}
