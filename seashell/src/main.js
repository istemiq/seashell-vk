/**
 * Точка входа (как в рабочем коммите + ранний Init в vk-early-init.js).
 */
import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.js';
import { captureVkLaunchParamsFromLocation } from './utils/vkUserId.js';
import { bootstrapVkSession } from './utils/vkSession.js';

async function bootstrap() {
  captureVkLaunchParamsFromLocation();

  createRoot(document.getElementById('root')).render(<AppConfig />);

  if (vkBridge.isWebView?.()) {
    vkBridge.send('VKWebAppInit').catch(() => {});
    void bootstrapVkSession({ skipInit: true });
  } else {
    vkBridge.send('VKWebAppInit').catch(() => {});
  }

  if (import.meta.env.MODE === 'development') {
    import('./eruda.js');
  }
}

bootstrap();
