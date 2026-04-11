import { useState, useEffect } from 'react';
import bridge from '@vkontakte/vk-bridge';
import { View, SplitLayout, SplitCol, ScreenSpinner } from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';

import { Persik, Home, Dictionary, Practice, Readme } from './panels';
import { DEFAULT_VIEW_PANELS } from './routes';

const BRIDGE_USER_INFO_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('bridge-timeout')), ms);
    }),
  ]);
}

export const App = () => {
  const { panel: activePanel = DEFAULT_VIEW_PANELS.HOME } = useActiveVkuiLocation();
  const [fetchedUser, setUser] = useState();
  const [popout, setPopout] = useState(<ScreenSpinner />);

  useEffect(() => {
    async function fetchData() {
      try {
        const user = await withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_USER_INFO_MS);
        setUser(user);
      } catch {
        // Превью в IDE / браузер без VK: промис может висеть бесконечно — убираем спиннер по таймауту
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
        </View>
      </SplitCol>
      {popout}
    </SplitLayout>
  );
};
