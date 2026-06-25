/** @typedef {'gigachat' | 'openrouter'} LlmProvider */

export function resolveLlmProvider() {
  const p = String(process.env.LLM_PROVIDER || 'gigachat').trim().toLowerCase();
  return p === 'openrouter' ? 'openrouter' : 'gigachat';
}

export function resolveLlmModel() {
  if (resolveLlmProvider() === 'openrouter') {
    return String(process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim() || 'deepseek/deepseek-chat';
  }
  return String(process.env.GIGACHAT_MODEL_NAME || 'GigaChat').trim() || 'GigaChat';
}

export function llmProviderLabel() {
  return resolveLlmProvider() === 'openrouter' ? 'OpenRouter' : 'GigaChat';
}
