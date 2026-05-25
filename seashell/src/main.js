/**
 * Точка входа фронтенда (Vite собирает бандл из этого файла).
 * Порядок: инициализация VK Bridge → монтирование React → в dev подключается Eruda (отладка в WebView).
 */
import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.js';
import { captureVkLaunchParamsFromLocation } from './utils/vkUserId.js';

async function bootstrap() {
  captureVkLaunchParamsFromLocation();

  // VKWebAppInit: в WebView VK ждём await; в обычном Chrome промис может не завершиться — не блокируем рендер.
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
