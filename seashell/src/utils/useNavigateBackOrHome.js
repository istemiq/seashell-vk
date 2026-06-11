import { useCallback } from 'react';
import {
  useRouteNavigator,
  useFirstPageCheck,
  useActiveVkuiLocation,
} from '@vkontakte/vk-mini-apps-router';

import { DEFAULT_VIEW_PANELS } from '../routes.js';

/**
 * VK часто открывает мини-приложение сразу на #/practice через VKWebAppChangeFragment + replace —
 * в истории один шаг, и routeNavigator.back() никуда не ведёт.
 * Если мы на «первой» записи истории и не на главной — делаем replace на /.
 */
export function useNavigateBackOrHome() {
  const routeNavigator = useRouteNavigator();
  const isFirstPage = useFirstPageCheck();
  const { panel } = useActiveVkuiLocation();

  return useCallback(async () => {
    const home = DEFAULT_VIEW_PANELS.HOME;
    if (panel && panel !== home && isFirstPage) {
      await routeNavigator.replace('/');
      return;
    }
    await routeNavigator.back();
  }, [routeNavigator, isFirstPage, panel]);
}
