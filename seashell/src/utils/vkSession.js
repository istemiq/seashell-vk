/**
 * Сессия VK Mini App: launch params для API и vk_user_id.
 * URL иногда теряет query после hash-router — дублируем через Bridge.
 */
import bridge from '@vkontakte/vk-bridge';

import { setVkUserIdFallback } from '../api/dictionaryApi.js';
import {
  captureVkLaunchParamsFromLocation,
  launchQueryHasSignature,
  storeVkLaunchParamsQueryString,
} from './vkUserId.js';
import { withTimeout } from './withTimeout.js';

const BRIDGE_INIT_MS = 12000;
const BRIDGE_USER_MS = 8000;
const BRIDGE_LAUNCH_MS = 8000;

function isVkHostedClient() {
  return Boolean(bridge.isEmbedded?.() || bridge.isWebView?.() || bridge.isIframe?.());
}

/** Поля ответа VKWebAppGetLaunchParams → query string для X-VK-Launch-Params. */
export function launchParamsObjectToQueryString(data) {
  if (!data || typeof data !== 'object') return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (k === 'sign') {
      if (v != null && v !== '') params.set('vk_sign', String(v));
    } else if (k.startsWith('vk_') && v != null) {
      // Пустые vk_* должны остаться — иначе vk_sign не сойдётся с URL.
      params.set(k, String(v));
    }
  }
  return params.toString();
}

function shouldPreferUrlLaunchParams(urlQs) {
  return Boolean(urlQs && urlQs.includes('vk_user_id=') && launchQueryHasSignature(urlQs));
}

/**
 * Сохранить launch params из URL и, в WebView, из VK Bridge.
 * Вызвать до первого запроса к API (main.js bootstrap).
 */
/** Обновить launch params из Bridge (после 401 или при старте). */
export async function refreshVkLaunchParamsFromBridge() {
  if (!isVkHostedClient()) return false;
  captureVkLaunchParamsFromLocation();
  try {
    const data = await withTimeout(bridge.send('VKWebAppGetLaunchParams'), BRIDGE_LAUNCH_MS);
    const qs = launchParamsObjectToQueryString(data);
    if (qs.includes('vk_user_id=') && launchQueryHasSignature(qs)) {
      storeVkLaunchParamsQueryString(qs);
      return true;
    }
  } catch (e) {
    console.warn('[Seashell] refreshVkLaunchParamsFromBridge', e);
  }
  return false;
}

export async function bootstrapVkSession({ skipInit = false } = {}) {
  captureVkLaunchParamsFromLocation();
  const urlBeforeBridge = typeof window !== 'undefined' ? String(window.location.search || '') : '';
  const urlQs = urlBeforeBridge.startsWith('?') ? urlBeforeBridge.slice(1) : urlBeforeBridge;
  const keepUrlSign = shouldPreferUrlLaunchParams(urlQs);

  if (!isVkHostedClient()) {
    return;
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

  if (launchResult.status === 'fulfilled' && !keepUrlSign) {
    const qs = launchParamsObjectToQueryString(launchResult.value);
    if (qs.includes('vk_user_id=') && launchQueryHasSignature(qs)) {
      storeVkLaunchParamsQueryString(qs);
    }
  } else if (launchResult.status === 'rejected') {
    console.warn('[Seashell] VKWebAppGetLaunchParams', launchResult.reason);
  }

  if (userResult.status === 'fulfilled' && userResult.value?.id) {
    setVkUserIdFallback(userResult.value.id);
  } else if (userResult.status === 'rejected') {
    console.warn('[Seashell] VKWebAppGetUserInfo', userResult.reason);
  }
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
