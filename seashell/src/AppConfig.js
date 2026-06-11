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

const MOBILE_PLATFORMS = new Set([
  'mobile_iphone',
  'mobile_android',
  'mobile_ipad',
  'mobile_web',
  'mobile_iphone_messenger',
  'mobile_android_messenger',
]);

/** WebView VK часто отдаёт нулевые insets — минимальные поля на мобильных. */
function mergeSafeAreaInsets(insets, vkPlatform) {
  const base = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const isMobile = vkPlatform && MOBILE_PLATFORMS.has(vkPlatform);
  const sideFloor = isMobile ? 12 : 0;
  const bottomFloor = isMobile ? 20 : 0;
  return {
    top: base.top ?? 0,
    left: Math.max(base.left ?? 0, sideFloor),
    right: Math.max(base.right ?? 0, sideFloor),
    bottom: Math.max(base.bottom ?? 0, bottomFloor),
  };
}

export const AppConfig = () => {
  const bridgeInsets = useInsets();
  const adaptivity = transformVKBridgeAdaptivity(useAdaptivity());
  const { vk_platform } = parseURLSearchParamsForGetLaunchParams(window.location.search);
  const vkBridgeInsets = mergeSafeAreaInsets(bridgeInsets, vk_platform);

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
