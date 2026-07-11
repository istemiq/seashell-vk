import { fetch as undiciFetch } from 'undici';

const CHAT_URL = 'https://api.deepseek.com/v1/chat/completions';

function mapNetErr(err, phase) {
  const raw = String(err?.cause?.message || err?.message || err);
  const low = raw.toLowerCase();
  const looksNet =
    low.includes('fetch failed') ||
    low.includes('econn') ||
    low.includes('enotfound') ||
    low.includes('etimedout');
  if (!looksNet) return err instanceof Error ? err : new Error(raw);
  return new Error(`DeepSeek (${phase}): network error. ${raw}`);
}

/**
 * OpenAI-compatible chat via DeepSeek API (api.deepseek.com).
 * Use when OpenRouter is blocked from datacenter IP but DeepSeek is reachable.
 */
export async function deepSeekChatCompletion({
  model,
  messages,
  temperature,
  max_tokens,
  top_p,
  repetition_penalty,
}) {
  const key = String(process.env.DEEPSEEK_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }

  const body = {
    model: model || 'deepseek-chat',
    messages,
  };
  if (temperature != null) body.temperature = temperature;
  if (max_tokens != null) body.max_tokens = max_tokens;
  if (top_p != null) body.top_p = top_p;
  if (repetition_penalty != null) body.frequency_penalty = repetition_penalty;

  let res;
  try {
    res = await undiciFetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      headersTimeout: 25_000,
      bodyTimeout: 120_000,
    });
  } catch (e) {
    throw mapNetErr(e, 'chat');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`DeepSeek chat: ${res.status} ${JSON.stringify(data)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty DeepSeek response');
  }
  return content;
}
