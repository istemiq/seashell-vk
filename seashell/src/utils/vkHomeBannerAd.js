/**
 * Баннер VK на главной: нижний sticky, экран ужимается (resize).
 * @see https://dev.vk.com/ru/bridge/VKWebAppShowBannerAd
 */
import bridge from '@vkontakte/vk-bridge';

const BANNER_PARAMS = {
  banner_location: 'bottom',
  layout_type: 'resize',
  banner_align: 'center',
  height_type: 'regular',
};

let bannerVisible = false;
let showInFlight = null;

function isVkHostedClient() {
  if (typeof bridge.isEmbedded === 'function' && bridge.isEmbedded()) return true;
  if (typeof bridge.isWebView === 'function' && bridge.isWebView()) return true;
  if (typeof bridge.isIframe === 'function' && bridge.isIframe()) return true;
  return false;
}

/** Запросить нижний баннер (показ решает VK: инвентарь, аккаунт). */
export async function showVkHomeBannerAd() {
  if (!isVkHostedClient() || bannerVisible) return;
  if (showInFlight) return showInFlight;

  showInFlight = (async () => {
    try {
      const data = await bridge.send('VKWebAppShowBannerAd', BANNER_PARAMS);
      if (data?.result === true) {
        bannerVisible = true;
      }
    } catch (error) {
      console.warn('[Seashell] VKWebAppShowBannerAd', error);
    } finally {
      showInFlight = null;
    }
  })();

  return showInFlight;
}

/** Скрыть баннер при уходе с главной. */
export function hideVkHomeBannerAd() {
  if (!bannerVisible) return;
  bannerVisible = false;
  void bridge.send('VKWebAppHideBannerAd').catch(() => {});
}
