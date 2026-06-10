/**
 * Баннерная реклама VK Mini Apps.
 * @see https://dev.vk.com/ru/mini-apps/monetization/ad/implementation
 *
 * Показ решает VK (таргетинг, лимиты, аккаунт админа). Мы только запрашиваем ShowBannerAd.
 */
import bridge from '@vkontakte/vk-bridge';

const BANNER_PARAMS = {
  banner_location: 'bottom',
  layout_type: 'resize',
};

const RETRY_DELAYS_MS = [400, 1200, 3000, 6000];

let bannerShown = false;
let attemptInFlight = null;
let bridgeSubscribed = false;
let backgroundRetries = 0;
const MAX_BACKGROUND_RETRIES = 8;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVkHostedClient() {
  if (typeof bridge.isEmbedded === 'function' && bridge.isEmbedded()) return true;
  if (typeof bridge.isWebView === 'function' && bridge.isWebView()) return true;
  if (typeof bridge.isIframe === 'function' && bridge.isIframe()) return true;
  return false;
}

function ensureBannerListeners() {
  if (bridgeSubscribed || typeof bridge.subscribe !== 'function') return;
  bridgeSubscribed = true;
  bridge.subscribe((event) => {
    if (event?.detail?.type === 'VKWebAppShowBannerAdResult' && event?.detail?.data?.result) {
      bannerShown = true;
    }
  });
}

async function showBannerAdOnce() {
  const data = await bridge.send('VKWebAppShowBannerAd', BANNER_PARAMS);
  return data?.result === true;
}

async function runBannerAttempts() {
  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    if (bannerShown) return true;
    if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1]);
    try {
      if (await showBannerAdOnce()) {
        bannerShown = true;
        return true;
      }
    } catch (e) {
      console.warn('[Seashell] VKWebAppShowBannerAd', e);
    }
  }
  return bannerShown;
}

function scheduleBackgroundRetries() {
  if (bannerShown || backgroundRetries >= MAX_BACKGROUND_RETRIES) return;
  const tick = () => {
    if (bannerShown || backgroundRetries >= MAX_BACKGROUND_RETRIES) return;
    backgroundRetries += 1;
    void tryShowVkBannerAd();
  };
  window.setInterval(tick, 45000);
}

/**
 * Запросить баннер VK (desktop iframe, mobile WebView).
 * Повторяем при навигации и возврате в приложение — у части аккаунтов инвентарь приходит с задержкой.
 */
export async function tryShowVkBannerAd() {
  if (!isVkHostedClient() || bannerShown) return;
  if (attemptInFlight) return attemptInFlight;

  ensureBannerListeners();

  attemptInFlight = runBannerAttempts().finally(() => {
    attemptInFlight = null;
    if (!bannerShown && backgroundRetries === 0) {
      scheduleBackgroundRetries();
    }
  });

  return attemptInFlight;
}

/** @deprecated alias */
export const initVkBannerAd = tryShowVkBannerAd;

export function hideVkBannerAd() {
  if (!bannerShown) return;
  bannerShown = false;
  void bridge.send('VKWebAppHideBannerAd').catch(() => {});
}
