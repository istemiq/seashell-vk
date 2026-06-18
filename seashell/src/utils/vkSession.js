/**
 * Сессия VK Mini App: launch params для API и vk_user_id.
 * В WebView источник истины — VKWebAppGetLaunchParams, не URL/hash (на mvk подпись часто ломается).
 */
import bridge from '@vkontakte/vk-bridge';

import { setVkUserIdFallback } from '../api/dictionaryApi.js';
import {
  captureVkLaunchParamsFromLocation,
  clearStoredVkLaunchParams,
  getVkLaunchParamsFromLocation,
  storeVkLaunchParamsQueryString,
  takeInitialLaunchSearchRaw,
} from './vkUserId.js';
import { withTimeout } from './withTimeout.js';

const BRIDGE_INIT_MS = 12000;
const BRIDGE_USER_MS = 8000;
const BRIDGE_LAUNCH_MS = 8000;

let sessionReadyDone = false;
/** @type {Promise<void> | null} */
let sessionReadyPromise = null;

function finishSessionReady() {
  if (sessionReadyDone) return;
  sessionReadyDone = true;
}

/** Дождаться bootstrapVkSession (WebView) или сразу resolve вне VK. */
export function whenVkSessionReady() {
  if (sessionReadyDone) return Promise.resolve();
  if (!sessionReadyPromise) return Promise.resolve();
  return sessionReadyPromise;
}

/** Поля VKWebAppGetLaunchParams → query string (fallback, если нет сырого search). */
export function launchParamsObjectToQueryString(data) {
  if (!data || typeof data !== 'object') return '';
  const vkPairs = [];
  let signValue = null;

  for (const [k, v] of Object.entries(data)) {
    if (k === 'sign' || k === 'vk_sign') {
      signValue = v == null ? '' : String(v);
      continue;
    }
    if (!k.startsWith('vk_')) continue;
    if (v === null || v === undefined) continue;
    // Пустые vk_* (например vk_access_token_settings=) участвуют в vk_sign — не пропускать ''.
    vkPairs.push([k, String(v)]);
  }

  vkPairs.sort((a, b) => a[0].localeCompare(b[0]));
  const parts = vkPairs.map(([k, v]) => `${k}=${v}`);
  if (signValue !== null) {
    parts.push(`sign=${signValue}`);
  }
  return parts.join('&');
}

/**
 * Сохранить launch params из VK Bridge (WebView) или из URL (браузер).
 * Вызвать до первого запроса к API (main.js bootstrap).
 */
export async function bootstrapVkSession({ skipInit = false } = {}) {
  if (!sessionReadyPromise) {
    sessionReadyPromise = (async () => {
      const inWebView = typeof bridge.isWebView === 'function' && bridge.isWebView();

      if (inWebView) {
        const rawFromSearch = takeInitialLaunchSearchRaw();
        clearStoredVkLaunchParams();

        if (rawFromSearch) {
          storeVkLaunchParamsQueryString(rawFromSearch);
        }

        if (!skipInit) {
          try {
            await withTimeout(bridge.send('VKWebAppInit'), BRIDGE_INIT_MS);
          } catch (e) {
            console.warn('[Seashell] VKWebAppInit', e);
          }
        }

        const [launchResult, userResult] = await Promise.allSettled([
          withTimeout(bridge.send('VKWebAppGetLaunchParams'), BRIDGE_LAUNCH_MS),
          withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_USER_MS),
        ]);

        if (!rawFromSearch) {
          if (launchResult.status === 'fulfilled') {
            const qs = launchParamsObjectToQueryString(launchResult.value);
            if (qs.includes('vk_user_id=')) {
              storeVkLaunchParamsQueryString(qs);
            }
          } else {
            console.warn('[Seashell] VKWebAppGetLaunchParams', launchResult.reason);
            captureVkLaunchParamsFromLocation();
          }
        }

        if (userResult.status === 'fulfilled' && userResult.value?.id) {
          setVkUserIdFallback(userResult.value.id);
        } else if (userResult.status === 'rejected') {
          console.warn('[Seashell] VKWebAppGetUserInfo', userResult.reason);
        }
      } else {
        captureVkLaunchParamsFromLocation();
      }
    })().finally(() => {
      finishSessionReady();
    });
  }

  return sessionReadyPromise;
}

export function getVkPlatformFromSession() {
  const qs = getVkLaunchParamsFromLocation();
  if (qs) {
    const fromStored = new URLSearchParams(qs).get('vk_platform');
    if (fromStored) return fromStored;
  }
  const search = String(typeof window !== 'undefined' ? window.location.search : '').replace(/^\?/, '');
  if (search.includes('vk_platform=')) {
    return new URLSearchParams(search).get('vk_platform');
  }
  return null;
}
