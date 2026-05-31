/**
 * Обёртка приложения: ConfigProvider (тёмная тема VKUI), стили терминала (`styles/crt-theme.css`),
 * safe area, роутер. Класс `seashell-crt` на AppRoot задаёт тёмную «консольную» палитру.
 */
import vkBridge, { parseURLSearchParamsForGetLaunchParams } from '@vkontakte/vk-bridge';
import { useAdaptivity, useInsets } from '@vkontakte/vk-bridge-react';
import { AdaptivityProvider, ConfigProvider, AppRoot } from '@vkontakte/vkui';
import { RouterProvider } from '@vkontakte/vk-mini-apps-router';
import '@vkontakte/vkui/dist/vkui.css';
import './styles/crt-theme.css';

import { transformVKBridgeAdaptivity } from './utils';
import { router } from './routes';
import { App } from './App';

export const AppConfig = () => {
  const vkBridgeInsets = useInsets() || undefined;
  const adaptivity = transformVKBridgeAdaptivity(useAdaptivity());
  const { vk_platform } = parseURLSearchParamsForGetLaunchParams(window.location.search);

  return (
    <ConfigProvider
      colorScheme="dark"
      platform={vk_platform === 'desktop_web' ? 'vkcom' : undefined}
      isWebView={vkBridge.isWebView()}
    >
      <AdaptivityProvider {...adaptivity}>
        <AppRoot mode="full" safeAreaInsets={vkBridgeInsets} className="seashell-crt">
          <RouterProvider router={router}>
            <App />
          </RouterProvider>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
};
