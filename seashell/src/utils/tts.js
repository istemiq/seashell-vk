import { fetchTtsWav } from '../api/dictionaryApi.js';
import { loadSettings } from './settings.js';

let audioSingleton = null;
let objectUrlInUse = null;

function canUseWebSpeech() {
  return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
}

function tryWebSpeech(text) {
  const s = loadSettings();
  if (!s.ttsEnabled) return false;
  if (!canUseWebSpeech()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = Number(s.ttsRate) || 0.95;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

async function playServerTts(text) {
  const s = loadSettings();
  if (!s.ttsEnabled) return;

  const blob = await fetchTtsWav(text);
  const url = URL.createObjectURL(blob);

  if (!audioSingleton) {
    audioSingleton = new Audio();
  }

  if (objectUrlInUse) {
    try {
      URL.revokeObjectURL(objectUrlInUse);
    } catch {
      // ignore
    }
    objectUrlInUse = null;
  }

  objectUrlInUse = url;
  audioSingleton.src = url;
  audioSingleton.playbackRate = 1;
  try {
    await audioSingleton.play();
  } finally {
    const cleanup = () => {
      audioSingleton?.removeEventListener?.('ended', cleanup);
      if (objectUrlInUse) {
        try {
          URL.revokeObjectURL(objectUrlInUse);
        } catch {
          // ignore
        }
        objectUrlInUse = null;
      }
    };
    audioSingleton.addEventListener('ended', cleanup, { once: true });
  }
}

/**
 * Озвучка английского текста:
 * - сначала пробуем Web Speech API (быстро и бесплатно);
 * - если не удалось/недоступно — фолбэк на серверный TTS (/api/tts).
 */
export async function speakEnglish(text) {
  const t = String(text ?? '').trim();
  if (!t) return;

  const started = tryWebSpeech(t);
  if (started) {
    // В некоторых WebView вызов принимается, но звук не стартует; серверный фолбэк всё равно доступен через кнопку повторно.
    return;
  }
  await playServerTts(t);
}

