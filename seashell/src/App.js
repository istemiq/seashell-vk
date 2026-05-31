/**
 * Корневой компонент: один View со всеми панелями (home, dictionary, practice…).
 * Загружает данные пользователя через VK Bridge для главной страницы.
 */
import { useState, useEffect } from 'react';
import bridge from '@vkontakte/vk-bridge';
import {
  View,
  SplitLayout,
  SplitCol,
  Panel,
  PanelHeader,
  Group,
  Placeholder,
  Text,
} from '@vkontakte/vkui';
import { useActiveVkuiLocation } from '@vkontakte/vk-mini-apps-router';

import { SeashellScreenSpinner } from './components/SeashellScreenSpinner.js';
import { SplitModalSlotContext } from './context/SplitModalSlotContext.js';
import { Persik, Home, Dictionary, Practice, Readme, Settings, Privacy } from './panels';
import { DEFAULT_VIEW_PANELS } from './routes';
import { withTimeout } from './utils/withTimeout.js';
import { setVkUserIdFallback } from './api/dictionaryApi.js';
import { getVkUserIdFromLocation } from './utils/vkUserId.js';

const BRIDGE_USER_INFO_MS = 8000;
const DEV_FALLBACK_VK_USER_ID = Number(import.meta.env.VITE_DEV_VK_USER_ID) || 1000001;

/** Экран «недоступно» только если явно включили при сборке: VITE_SHOW_MAINTENANCE=1 */
const showMaintenanceRaw = String(import.meta.env.VITE_SHOW_MAINTENANCE ?? '')
  .trim()
  .toLowerCase();
const showMaintenanceForUsers =
  showMaintenanceRaw === '1' || showMaintenanceRaw === 'true' || showMaintenanceRaw === 'yes';

function MaintenanceScreen() {
  return (
    <Panel id="maintenance">
      <PanelHeader>Seashell</PanelHeader>
      <Group>
        <Placeholder>
          <Text weight="2" style={{ marginBottom: 12 }}>
            Сервис временно недоступен
          </Text>
          <Text style={{ lineHeight: 1.55 }}>
            Сейчас мы обновляем Seashell. Словарь и разговорная практика временно не работают — новые
            слова добавить не получится.
          </Text>
          <Text style={{ lineHeight: 1.55, marginTop: 12 }}>
            Загляните снова через пару дней. Спасибо за понимание!
          </Text>
        </Placeholder>
      </Group>
    </Panel>
  );
}

export const App = () => {
  const { panel: activePanel = DEFAULT_VIEW_PANELS.HOME } = useActiveVkuiLocation();
  const [fetchedUser, setUser] = useState();
  const [popout, setPopout] = useState(<SeashellScreenSpinner />);
  const [splitModalMountEl, setSplitModalMountEl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Не блокируем UI, если Bridge завис (модераторы / часть WebView).
    const showUiTimer = window.setTimeout(() => {
      if (!cancelled) setPopout(null);
    }, 2500);

    async function fetchData() {
      try {
        const user = await withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_USER_INFO_MS);
        if (cancelled) return;
        setUser(user);
        if (user?.id) {
          setVkUserIdFallback(user.id);
        }
      } catch {
        if (cancelled) return;
        if (!getVkUserIdFromLocation() && !bridge.isWebView()) {
          setVkUserIdFallback(DEV_FALLBACK_VK_USER_ID);
        }
      } finally {
        if (!cancelled) setPopout(null);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
      window.clearTimeout(showUiTimer);
    };
  }, []);

  return (
    <SplitModalSlotContext.Provider value={splitModalMountEl}>
      {/*
       * НЕ через SplitLayout modal: во flex-сетке второй столбец схлопывается (~0 px) — модалка «в столбец» из букв.
       * Отдельный fixed-слой вне SplitLayout сохраняет полную ширину и координаты мини-приложения без transform Panel.
       */}
      <SplitLayout>
        <SplitCol>
          {showMaintenanceForUsers ? (
            <MaintenanceScreen />
          ) : (
            <View activePanel={activePanel}>
              <Home id="home" fetchedUser={fetchedUser} />
              <Persik id="persik" />
              <Dictionary id="dictionary" />
              <Practice id="practice" />
              <Readme id="readme" />
              <Settings id="settings" />
              <Privacy id="privacy" />
            </View>
          )}
        </SplitCol>
        {popout}
      </SplitLayout>
      <div
        ref={setSplitModalMountEl}
        className="seashell-global-modal-mount"
        aria-hidden="true"
      />
    </SplitModalSlotContext.Provider>
  );
};
