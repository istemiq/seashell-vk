/**
 * Корневой компонент: один View со всеми панелями (home, dictionary, practice…).
 * Загружает данные пользователя через VK Bridge для главной страницы.
 */
import { useState, useEffect } from 'react';
import bridge from '@vkontakte/vk-bridge';
import { View, SplitLayout, SplitCol, ScreenSpinner } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';

import { Persik, Home, Dictionary, Practice, Readme, Settings } from './panels';
import { DEFAULT_VIEW_PANELS } from './routes';
import { withTimeout } from './utils/withTimeout.js';
import { setVkUserIdFallback } from './api/dictionaryApi.js';
import { getVkUserIdFromLocation } from './utils/vkUserId.js';

const BRIDGE_USER_INFO_MS = 8000;
const DEV_FALLBACK_VK_USER_ID = Number(import.meta.env.VITE_DEV_VK_USER_ID) || 1000001;

export const App = () => {
  const { panel: activePanel = DEFAULT_VIEW_PANELS.HOME } = useActiveVkuiLocation();
  const [fetchedUser, setUser] = useState();
  const [popout, setPopout] = useState(<ScreenSpinner />);

  useEffect(() => {
    async function fetchData() {
      try {
        const user = await withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_USER_INFO_MS);
        setUser(user);
        if (user?.id) {
          setVkUserIdFallback(user.id);
        }
      } catch {
        // Превью в IDE / браузер без VK: промис может висеть бесконечно — убираем спиннер по таймауту
        // Для разработки вне VK ставим fallback, чтобы работали все панели (включая "Повторение").
        if (!getVkUserIdFromLocation() && !bridge.isWebView()) {
          setVkUserIdFallback(DEV_FALLBACK_VK_USER_ID);
        }
      } finally {
        setPopout(null);
      }
    }
    fetchData();
  }, []);

  return (
    <SplitLayout>
      <SplitCol>
        <View activePanel={activePanel}>
          <Home id="home" fetchedUser={fetchedUser} />
          <Persik id="persik" />
          <Dictionary id="dictionary" />
          <Practice id="practice" />
          <Readme id="readme" />
          <Settings id="settings" />
        </View>
      </SplitCol>
      {popout}
    </SplitLayout>
  );
};
