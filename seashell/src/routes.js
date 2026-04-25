/**
 * Конфигурация маршрутов (hash router: #/dictionary и т.д.).
 * Каждая панель — отдельный экран внутри одного View.
 */
import {
  createHashRouter,
  createPanel,
  createRoot,
  createView,
  RoutesConfig,
} from '@vkontakte/vk-mini-apps-router';

export const DEFAULT_ROOT = 'default_root';

export const DEFAULT_VIEW = 'default_view';

export const DEFAULT_VIEW_PANELS = {
  HOME: 'home',
  PERSIK: 'persik',
  DICTIONARY: 'dictionary',
  PRACTICE: 'practice',
  README: 'readme',
  SETTINGS: 'settings',
};

export const routes = RoutesConfig.create([
  createRoot(DEFAULT_ROOT, [
    createView(DEFAULT_VIEW, [
      createPanel(DEFAULT_VIEW_PANELS.HOME, '/', []),
      createPanel(DEFAULT_VIEW_PANELS.PERSIK, `/${DEFAULT_VIEW_PANELS.PERSIK}`, []),
      createPanel(DEFAULT_VIEW_PANELS.DICTIONARY, `/${DEFAULT_VIEW_PANELS.DICTIONARY}`, []),
      createPanel(DEFAULT_VIEW_PANELS.PRACTICE, `/${DEFAULT_VIEW_PANELS.PRACTICE}`, []),
      createPanel(DEFAULT_VIEW_PANELS.README, `/${DEFAULT_VIEW_PANELS.README}`, []),
      createPanel(DEFAULT_VIEW_PANELS.SETTINGS, `/${DEFAULT_VIEW_PANELS.SETTINGS}`, []),
    ]),
  ]),
]);

export const router = createHashRouter(routes.getRoutes());
