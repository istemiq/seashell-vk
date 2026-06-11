/**
 * Точка входа (как в рабочем коммите + ранний Init в vk-early-init.js).
 */
import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.js';
import { captureVkLaunchParamsFromLocation } from './utils/vkUserId.js';
import { bootstrapVkSession } from './utils/vkSession.js';
import { tryShowVkBannerAd } from './utils/vkBannerAd.js';

async function bootstrap() {
  const inVk =
    vkBridge.isEmbedded?.() || vkBridge.isWebView?.() || vkBridge.isIframe?.();

  if (inVk) {
    await bootstrapVkSession();
  } else {
    captureVkLaunchParamsFromLocation();
    vkBridge.send('VKWebAppInit').catch(() => {});
  }

  createRoot(document.getElementById('root')).render(<AppConfig />);

  if (inVk) {
    void tryShowVkBannerAd();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void tryShowVkBannerAd();
    });
  }

  if (import.meta.env.MODE === 'development') {
    import('./eruda.js');
  }
}

bootstrap();
