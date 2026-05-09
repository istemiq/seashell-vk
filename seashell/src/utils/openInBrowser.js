import bridge from '@vkontakte/vk-bridge';
import { withTimeout } from './withTimeout.js';

const BRIDGE_OPEN_MS = 2500;

async function writeClipboardSafe(text) {
  const s = String(text ?? '');
  if (!s) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    // ignore
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy') === true;
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function copyUrlToClipboard(url = null) {
  const u = String(url || (typeof window !== 'undefined' ? window.location.href : '')).trim();
  if (!u) return { ok: false, error: 'Пустая ссылка' };
  const ok = await writeClipboardSafe(u);
  return ok ? { ok: true, method: 'clipboard' } : { ok: false, error: 'Не удалось скопировать ссылку' };
}

function openViaAnchorClick(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  a.style.top = '0';
  document.body.appendChild(a);
  try {
    a.click();
    return true;
  } catch {
    return false;
  } finally {
    // В WebView иногда клик "съедается", если элемент удалить слишком рано.
    setTimeout(() => {
      try {
        a.remove();
      } catch {
        // ignore
      }
    }, 0);
  }
}

function buildOpenCandidates(url) {
  const u = String(url || '').trim();
  if (!u) return [];

  const out = [];
  const push = (x) => {
    const s = String(x || '').trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };

  push(u);

  try {
    if (typeof URL === 'function') {
      const parsed = new URL(u);
      const host = String(parsed.hostname || '').toLowerCase();
      const isVkHost =
        host === 'vk.com' ||
        host.endsWith('.vk.com') ||
        host === 'vk.ru' ||
        host.endsWith('.vk.ru') ||
        host === 'm.vk.com';

      // Иногда WebView лучше открывает "away"‑обёртку (особенно для не‑VK URL).
      if (parsed.protocol === 'https:' && !isVkHost) {
        push(`https://vk.com/away.php?utf=1&to=${encodeURIComponent(parsed.toString())}`);
      }
    }
  } catch {
    // ignore
  }

  return out;
}

function normalizeUrlForMiniAppWebView(u) {
  let out = String(u || '').trim();
  if (!out) return out;
  try {
    if (!bridge.isIframe() && !bridge.isWebView()) return out;
    if (typeof URL === 'function') {
      const parsed = new URL(out);
      const host = String(parsed.hostname || '').toLowerCase();
      const isLocal =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.local') ||
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (!isLocal && parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
        out = parsed.toString();
      }
    } else if (out.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)\b/i.test(out)) {
      out = `https://${out.slice('http://'.length)}`;
    }
  } catch {
    // ignore
  }
  return out;
}

function trySyncOpenInNewWindow(candidates) {
  for (const cand of candidates) {
    if (openViaAnchorClick(cand)) {
      return { ok: true, method: 'anchor' };
    }
  }
  for (const cand of candidates) {
    try {
      const w = window.open(cand, '_blank', 'noopener,noreferrer');
      if (w) return { ok: true, method: 'window.open' };
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Пытается открыть текущий экран во внешнем браузере.
 * В разных клиентах VK поддержка bridge-событий может отличаться,
 * поэтому делаем best-effort: сначала синхронный anchor/window.open (пока жив user gesture),
 * затем bridge, затем копирование / навигация.
 *
 * Возвращает { ok: boolean, method?: string, error?: string }
 */
export async function openInBrowser(url = null) {
  let u = String(url || (typeof window !== 'undefined' ? window.location.href : '')).trim();
  if (!u) return { ok: false, error: 'Пустая ссылка' };

  u = normalizeUrlForMiniAppWebView(u);
  const candidates = buildOpenCandidates(u);

  const syncHit = trySyncOpenInNewWindow(candidates);
  if (syncHit) return syncHit;

  try {
    await withTimeout(bridge.send('VKWebAppInit'), BRIDGE_OPEN_MS);
  } catch {
    // ignore
  }

  // Важно: VKWebAppOpenLink иногда "успешно" завершается, но визуально ничего не открывает.
  for (const cand of candidates) {
    try {
      await withTimeout(bridge.send('VKWebAppOpenLink', { url: cand }), BRIDGE_OPEN_MS);
    } catch {
      // ignore
    }
  }

  for (const cand of candidates) {
    try {
      await withTimeout(bridge.send('VKWebAppOpenURL', { url: cand }), BRIDGE_OPEN_MS);
    } catch {
      // ignore
    }
  }

  const afterBridge = trySyncOpenInNewWindow(candidates);
  if (afterBridge) return afterBridge;

  const copiedOk = await writeClipboardSafe(u);
  if (copiedOk) return { ok: true, method: 'clipboard', error: undefined };

  // Последний шанс: навигация в этой вкладке (хуже UX, но лучше чем тупик).
  try {
    window.location.href = u;
    return { ok: true, method: 'location' };
  } catch {
    return { ok: false, error: 'Не удалось открыть ссылку' };
  }
}

