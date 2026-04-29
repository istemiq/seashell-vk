import { loadSettings } from './settings.js';

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
    u.lang = 'en-US';
    u.rate = Number(s.ttsRate) || 0.95;
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/**
 * Озвучка английского текста:
 * - используем только Web Speech API (голос устройства).
 */
export async function speakEnglish(text) {
  const t = String(text ?? '').trim();
  if (!t) return;

  const started = await tryWebSpeech(t);
  if (!started) {
    throw new Error(
      'Озвучка недоступна в этом браузере/вью (часто VK WebView). Попробуй открыть в браузере или включить системный TTS на телефоне.',
    );
  }
}

