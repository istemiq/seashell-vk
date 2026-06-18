/**
 * Точка входа (как в рабочем коммите + ранний Init в vk-early-init.js).
 */
import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.js';
import { preserveInitialLaunchSearch } from './utils/vkUserId.js';
import { bootstrapVkSession } from './utils/vkSession.js';

async function bootstrap() {
  preserveInitialLaunchSearch();
  if (vkBridge.isWebView?.()) {
    vkBridge.send('VKWebAppInit').catch(() => {});
    await bootstrapVkSession({ skipInit: true });
  } else {
    vkBridge.send('VKWebAppInit').catch(() => {});
    await bootstrapVkSession();
  }

  createRoot(document.getElementById('root')).render(<AppConfig />);

  if (import.meta.env.MODE === 'development') {
    import('./eruda.js');
  }
}

bootstrap();
