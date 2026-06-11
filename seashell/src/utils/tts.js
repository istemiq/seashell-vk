import { loadSettings } from './settings.js';
import vkBridge from '@vkontakte/vk-bridge';
import { postTtsSpeak, resolveTtsPlayUrl } from '../api/ttsApi.js';

/** Текущий HTML5 Audio (backend mp3). */
let activeAudio = null;
/** Счётчик: новый speak отменяет предыдущий. */
let speakGeneration = 0;

function canUseWebSpeech() {
  return (
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/** Остановить любую текущую озвучку (mp3 + Web Speech). */
export function stopSpeaking() {
  speakGeneration += 1;
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.removeAttribute('src');
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (canUseWebSpeech()) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeakingActive() {
  if (activeAudio && !activeAudio.paused && !activeAudio.ended) return true;
  if (canUseWebSpeech() && window.speechSynthesis.speaking) return true;
  return false;
}

function isEnglishVoice(v) {
  const lang = String(v?.lang || '').toLowerCase();
  return lang.startsWith('en');
}

function pickEnglishVoice() {
  const voices = window.speechSynthesis.getVoices?.() || [];
  const en = voices.filter(isEnglishVoice);
  if (!en.length) return null;

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

async function tryWebSpeech(text, generation) {
  const s = loadSettings();
  if (!s.ttsEnabled) return false;
  if (!canUseWebSpeech()) return false;
  if (generation !== speakGeneration) return false;
  try {
    await ensureVoicesLoaded();
    if (generation !== speakGeneration) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = String(s.ttsLocale || 'en-US');
    u.rate = Number(s.ttsRate) || 0.95;
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;
    await new Promise((resolve, reject) => {
      if (generation !== speakGeneration) {
        resolve(false);
        return;
      }
      u.onend = () => resolve(true);
      u.onerror = () => reject(new Error('speech error'));
      window.speechSynthesis.speak(u);
    });
    return generation === speakGeneration;
  } catch {
    return false;
  }
}

function playUrl(url, generation) {
  const u = resolveTtsPlayUrl(url);
  if (!u || generation !== speakGeneration) return Promise.resolve(false);

  return new Promise((resolve) => {
    const a = new Audio(u);
    activeAudio = a;
    a.preload = 'auto';

    const finish = (ok) => {
      if (activeAudio === a) activeAudio = null;
      resolve(ok && generation === speakGeneration);
    };

    a.addEventListener('ended', () => finish(true), { once: true });
    a.addEventListener('error', () => finish(false), { once: true });

    a.play()
      .then(() => {
        if (generation !== speakGeneration) {
          a.pause();
          finish(false);
        }
      })
      .catch(async () => {
        if (generation !== speakGeneration) {
          finish(false);
          return;
        }
        if (vkBridge.isWebView?.()) {
          try {
            await vkBridge.send('VKWebAppAudioPlay', { url: u });
            finish(true);
            return;
          } catch {
            /* fall through */
          }
        }
        finish(false);
      });
  });
}

async function tryBackendTts(text, generation) {
  const s = loadSettings();
  if (!s.ttsEnabled) return false;
  if (generation !== speakGeneration) return false;
  try {
    const locale = String(s.ttsLocale || 'en-US');
    const r = await postTtsSpeak({ text, locale, rate: Number(s.ttsRate) || 0.95 });
    if (generation !== speakGeneration) return false;
    return await playUrl(r.url, generation);
  } catch {
    return false;
  }
}

/**
 * Озвучка английского текста (один поток: повторный вызов останавливает предыдущий).
 */
export async function speakEnglish(text) {
  const t = String(text ?? '').trim();
  if (!t) return;

  stopSpeaking();
  const generation = speakGeneration;

  if (await tryBackendTts(t, generation)) return;
  if (generation !== speakGeneration) return;

  if (await tryWebSpeech(t, generation)) return;
  if (generation !== speakGeneration) return;

  throw new Error(
    'Озвучка недоступна. Проверьте интернет, что API отвечает, и что озвучка включена в настройках.',
  );
}
