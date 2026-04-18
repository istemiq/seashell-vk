import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.js';

async function bootstrap() {
  // В обычном браузере VKWebAppInit часто «висит» — без этого UI не монтируется (белый экран).
  // В клиенте VK нужно дождаться init.
  if (vkBridge.isWebView?.()) {
    await vkBridge.send('VKWebAppInit');
  } else {
    vkBridge.send('VKWebAppInit').catch(() => {});
  }
  createRoot(document.getElementById('root')).render(<AppConfig />);
  if (import.meta.env.MODE === 'development') {
    import('./eruda.js');
  }
}

bootstrap();
