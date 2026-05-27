import { loadSettings } from './settings.js';
import vkBridge from '@vkontakte/vk-bridge';
import { postTtsSpeak, resolveTtsPlayUrl } from '../api/ttsApi.js';

function canUseWebSpeech() {
  return (
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

function isEnglishVoice(v) {
  const lang = String(v?.lang || '').toLowerCase();
  return lang.startsWith('en');
}

function pickEnglishVoice() {
  const voices = window.speechSynthesis.getVoices?.() || [];
  const en = voices.filter(isEnglishVoice);
  if (!en.length) return null;

  // Пробуем сначала более "человечные" голоса, если есть.
  const preferred = en.find((v) => /google|microsoft|siri|alex|zira|mark/i.test(String(v.name || '')));
  return preferred || en[0];
}

async function ensureVoicesLoaded(timeoutMs = 1200) {
  if (!canUseWebSpeech()) return;
  const initial = window.speechSynthesis.getVoices?.() || [];
  if (initial.length) return;
  await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeoutMs);
    window.speechSynthesis.onvoiceschanged = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
  });
}

async function tryWebSpeech(text) {
  const s = loadSettings();
  if (!s.ttsEnabled) return false;
  if (!canUseWebSpeech()) return false;
  try {
    await ensureVoicesLoaded();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = String(s.ttsLocale || 'en-US');
    u.rate = Number(s.ttsRate) || 0.95;
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
    const startedSpeech = typeof window.speechSynthesis.speaking === 'boolean'
      ? window.speechSynthesis.speaking ||
        window.speechSynthesis.pending ||
        window.speechSynthesis.paused
      : true;
    if (!startedSpeech) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const stateOk =
      typeof window.speechSynthesis.speaking === 'boolean'
        ? window.speechSynthesis.speaking ||
          window.speechSynthesis.pending ||
          window.speechSynthesis.paused
        : true;
    return Boolean(stateOk);
  } catch {
    return false;
  }
}

async function playUrl(url) {
  const u = resolveTtsPlayUrl(url);
  if (!u) return false;

  // Основной способ в VK Mini App: HTML5 Audio + https mp3 с нашего API.
  try {
    const a = new Audio(u);
    a.preload = 'auto';
    await a.play();
    return true;
  } catch {
    // Запасной вариант (не на всех клиентах VK есть).
    if (vkBridge.isWebView?.()) {
      try {
        await vkBridge.send('VKWebAppAudioPlay', { url: u });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

async function tryBackendTts(text) {
  const s = loadSettings();
  if (!s.ttsEnabled) return false;
  try {
    const locale = String(s.ttsLocale || 'en-US');
    const r = await postTtsSpeak({ text, locale, rate: Number(s.ttsRate) || 0.95 });
    return await playUrl(r.url);
  } catch {
    return false;
  }
}

/**
 * Озвучка английского текста:
 * - везде сначала backend Piper (женский en-US) → mp3 с api.sishel.ru;
 * - если сервер недоступен — запасной Web Speech (голос устройства).
 */
export async function speakEnglish(text) {
  const t = String(text ?? '').trim();
  if (!t) return;

  if (await tryBackendTts(t)) return;

  if (await tryWebSpeech(t)) return;

  throw new Error(
    'Озвучка недоступна. Проверьте интернет, что API отвечает, и что озвучка включена в настройках.',
  );
}

