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
  vkBridge.send('VKWebAppInit').catch(() => {});

  // Не блокируем первый кадр: VK на mvk рубит «loading error», если React долго не монтируется.
  createRoot(document.getElementById('root')).render(<AppConfig />);

  const sessionTask =
    vkBridge.isWebView?.() ?
      bootstrapVkSession({ skipInit: true })
    : bootstrapVkSession();
  void sessionTask.catch((e) => {
    console.warn('[Seashell] bootstrapVkSession', e);
  });

  if (import.meta.env.MODE === 'development') {
    import('./eruda.js');
  }
}

bootstrap();
