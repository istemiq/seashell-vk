import { fetch as undiciFetch } from 'undici';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function mapNetErr(err, phase) {
  const raw = String(err?.cause?.message || err?.message || err);
  const low = raw.toLowerCase();
  const looksNet =
    low.includes('fetch failed') ||
    low.includes('econn') ||
    low.includes('enotfound') ||
    low.includes('etimedout');
  if (!looksNet) return err instanceof Error ? err : new Error(raw);
  return new Error(`OpenRouter (${phase}): сеть/HTTPS. Проверь интернет и VPN. Технически: ${raw}`);
}

/**
 * OpenAI-совместимый chat/completions через OpenRouter.
 * @param {{ model: string, messages: Array<{role: string, content: string}>, temperature?: number, max_tokens?: number, top_p?: number }} params
 */
export async function openRouterChatCompletion({ model, messages, temperature, max_tokens, top_p }) {
  const key = String(process.env.OPENROUTER_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const body = {
    model,
    messages,
  };
  if (temperature != null) body.temperature = temperature;
  if (max_tokens != null) body.max_tokens = max_tokens;
  if (top_p != null) body.top_p = top_p;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${key}`,
  };
  const referer = String(process.env.OPENROUTER_HTTP_REFERER || 'https://api.sishel.ru').trim();
  const title = String(process.env.OPENROUTER_APP_NAME || 'Seashell').trim();
  if (referer) headers['HTTP-Referer'] = referer;
  if (title) headers['X-Title'] = title;

  let res;
  try {
    res = await undiciFetch(CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      headersTimeout: 25_000,
      bodyTimeout: 120_000,
    });
  } catch (e) {
    throw mapNetErr(e, 'chat');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OpenRouter chat: ${res.status} ${JSON.stringify(data)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty OpenRouter response');
  }
  return content;
}
