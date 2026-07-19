/** @typedef {'openrouter' | 'deepseek'} LlmProvider */

export function resolveLlmProvider() {
  const p = String(process.env.LLM_PROVIDER || 'deepseek').trim().toLowerCase();
  if (p === 'openrouter') return 'openrouter';
  return 'deepseek';
}

export function resolveLlmModel() {
  const provider = resolveLlmProvider();
  if (provider === 'openrouter') {
    return String(process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim() || 'deepseek/deepseek-chat';
  }
  return String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim() || 'deepseek-chat';
}

export function llmProviderLabel() {
  const p = resolveLlmProvider();
  if (p === 'openrouter') return 'OpenRouter';
  return 'DeepSeek';
}
