/** Helpers for «Обновить примеры»: avoid repeating prior sentences and detect stale regen. */

export function normalizeExampleLine(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Share of new lines that exactly match any previous line (0..1). */
export function examplesOverlapRatio(previousTexts, newTexts) {
  const prev = new Set(
    (previousTexts || []).map(normalizeExampleLine).filter(Boolean),
  );
  if (!prev.size) return 0;
  const next = (newTexts || []).map(normalizeExampleLine).filter(Boolean);
  if (!next.length) return 0;
  let matches = 0;
  for (const line of next) {
    if (prev.has(line)) matches += 1;
  }
  return matches / next.length;
}

export function refreshAvoidExamplesNote(avoidExamples) {
  const lines = (avoidExamples || [])
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!lines.length) return '';
  const list = lines.map((t) => `- ${t}`).join('\n');
  return (
    '\n\nREGENERATION: Write completely NEW example sentences. ' +
    'Do NOT reuse, paraphrase, or closely imitate any of these existing English sentences:\n' +
    `${list}\n` +
    'Use fresh contexts, different grammar patterns, and varied vocabulary.'
  );
}

export function refreshExamplesTemperature(baseTemperature) {
  return Math.min(0.85, Math.max(baseTemperature, 0.58));
}
