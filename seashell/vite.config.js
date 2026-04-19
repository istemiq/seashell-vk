/**
 * Конфигурация Vite: React, прокси /api → localhost:3001 (Express), legacy-бандл при необходимости.
 * Подробности по пакетам — в DEPENDENCIES.md в корне seashell.
 */
import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

function handleModuleDirectivesPlugin() {
  return {
    name: 'handle-module-directives-plugin',
    transform(code, id) {
      if (id.includes('@vkontakte/icons')) {
        code = code.replace(/"use-client";?/g, '');
      }
      return { code };
    },
  };
}

function threatJsFilesAsJsx() {
  return {
    name: 'treat-js-files-as-jsx',
    async transform(code, id) {
      if (!id.match(/src\/.*\.js$/)) return null;

      return transformWithEsbuild(code, id, {
        loader: 'jsx',
        jsx: 'automatic',
      });
    },
  };
}

/**
 * Some chunks may be large.
 * This will not affect the loading speed of the site.
 * We collect several versions of scripts that are applied depending on the browser version.
 * This is done so that your code runs equally well on the site and in the odr.
 * The details are here: https://dev.vk.ru/mini-apps/development/on-demand-resources.
 */
export default defineConfig({
  base: './',

  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
    // Reverse tunnels (localhost.run и т.п.) меняют Host — иначе Vite отвечает "Blocked request"
    allowedHosts: true,
    host: true,
    // За TLS-туннелем HMR (wss) часто не совпадает с портом/хостом — в WebView VK ломается загрузка.
    // Запуск: PowerShell: $env:VITE_TUNNEL='1'; npm run start
    ...(process.env.VITE_TUNNEL === '1' ? { hmr: false } : {}),
  },

  plugins: [
    react(),
    threatJsFilesAsJsx(),
    handleModuleDirectivesPlugin(),
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),
  ],

  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },

  build: {
    outDir: 'build',
  },
});
