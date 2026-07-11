/** Normalize for loose comparison (echo vs typed user line). */
function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function tokenRecall(userText, echo) {
  const userTokens = tokenize(userText);
  if (!userTokens.length) return 1;
  const echoSet = new Set(tokenize(echo));
  let shared = 0;
  for (const t of userTokens) {
    if (echoSet.has(t)) shared += 1;
  }
  return shared / userTokens.length;
}

/**
 * True when model "echo" still reflects what the user actually sent.
 * Rejects paraphrases / invented questions (common LLM failure mode).
 */
export function echoReflectsUserInput(userText, echo) {
  const user = String(userText ?? '').trim();
  const ech = String(echo ?? '').trim();
  if (!user) return true;
  if (!ech) return false;
  if (ech.toLowerCase() === user.toLowerCase()) return true;

  const recall = tokenRecall(user, ech);
  if (recall < 0.45) return false;

  // Reject long rewrites of short messages ("Up to u" → full different question).
  if (user.length <= 24 && ech.length > user.length * 2.2 && recall < 0.75) {
    return false;
  }

  if (ech.length > user.length * 3 && recall < 0.6) return false;

  return true;
}

/**
 * Keep helpful typo fixes from the model; fall back to verbatim user text when echo drifts.
 */
export function sanitizePracticeEcho(userText, echo) {
  const user = String(userText ?? '').trim();
  if (!user) return null;
  const ech = String(echo ?? '').trim();
  if (!ech || !echoReflectsUserInput(user, ech)) return user;
  return ech;
}

/** Core phrase for multi-word dictionary lemmas (e.g. "as of tomorrow" → "as of"). */
function targetCorePhrase(targetWord) {
  const words = String(targetWord ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).join(' ');
  return words[0] ?? '';
}

/** True when the learner used the target lemma or its core phrase in their line. */
export function userUsedTargetPhrase(userText, targetWord) {
  const user = String(userText ?? '').toLowerCase();
  const target = String(targetWord ?? '').toLowerCase().trim();
  if (!target || !user) return false;
  if (user.includes(target)) return true;
  const core = targetCorePhrase(target);
  return core.length > 0 && user.includes(core);
}

/** Echo must not drop a target phrase the user intentionally used. */
export function echoPreservesTargetPhrase(userText, echo, targetWord) {
  if (!userUsedTargetPhrase(userText, targetWord)) return true;
  const ech = String(echo ?? '').toLowerCase();
  const target = String(targetWord ?? '').toLowerCase().trim();
  if (ech.includes(target)) return true;
  const core = targetCorePhrase(target);
  if (core && ech.includes(core)) return true;
  const head = target.split(/\s+/)[0];
  return head.length > 0 && ech.includes(head);
}

/** Word drill: keep verbatim user line when echo swaps the target phrase for a synonym. */
export function sanitizeWordPracticeEcho(userText, echo, targetWord) {
  const user = String(userText ?? '').trim();
  if (!user) return null;
  const ech = sanitizePracticeEcho(user, echo);
  if (!echoPreservesTargetPhrase(user, ech, targetWord)) return user;
  return ech;
}

const WORD_VARIANT_CORRECTION =
  /another way|instead of|you could say|try saying|maybe you meant|можно сказать|лучше сказать|вариант|перефраз/i;

/** Word drill: no "style variants" when the learner correctly used the target phrase. */
export function sanitizeWordPracticeCorrections(userText, corrections, targetWord) {
  if (corrections == null || corrections === '') return null;
  const text = String(corrections).trim();
  if (!text) return null;
  if (userUsedTargetPhrase(userText, targetWord) && WORD_VARIANT_CORRECTION.test(text)) {
    return null;
  }
  return text;
}
