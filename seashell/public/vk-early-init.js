/**
 * Синхронный VKWebAppInit до React (копия транспорта @vkontakte/vk-bridge).
 * Отдельный .js, не module — грузится в <head> без type="module".
 */
(function () {
  var CONNECT_VERSION = '2.15.11';
  var webFrameId = Math.random().toString(36).substring(2, 5);

  function send(handler, params) {
    params = params || {};
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge[handler] === 'function') {
        window.AndroidBridge[handler](JSON.stringify(params));
        return;
      }
      var wh = window.webkit && window.webkit.messageHandlers;
      if (wh && wh[handler] && typeof wh[handler].postMessage === 'function') {
        wh[handler].postMessage(params);
        return;
      }
      if (
        window.ReactNativeWebView &&
        typeof window.ReactNativeWebView.postMessage === 'function'
      ) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ handler: handler, params: params }),
        );
        return;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            handler: handler,
            params: params,
            type: 'vk-connect',
            webFrameId: webFrameId,
            connectVersion: CONNECT_VERSION,
          },
          '*',
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  send('VKWebAppInit');
})();
