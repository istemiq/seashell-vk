/** @typedef {'gigachat' | 'openrouter' | 'deepseek'} LlmProvider */

export function resolveLlmProvider() {
  const p = String(process.env.LLM_PROVIDER || 'openrouter').trim().toLowerCase();
  if (p === 'openrouter') return 'openrouter';
  if (p === 'gigachat') return 'gigachat';
  return 'deepseek';
}

export function resolveLlmModel() {
  const provider = resolveLlmProvider();
  if (provider === 'openrouter') {
    return String(process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim() || 'deepseek/deepseek-chat';
  }
  if (provider === 'deepseek') {
    return String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim() || 'deepseek-chat';
  }
  return String(process.env.GIGACHAT_MODEL_NAME || 'GigaChat').trim() || 'GigaChat';
}

export function llmProviderLabel() {
  const p = resolveLlmProvider();
  if (p === 'openrouter') return 'OpenRouter';
  if (p === 'deepseek') return 'DeepSeek';
  return 'GigaChat';
}
