/**
 * Конфигурация Vite: React, прокси /api, modern + legacy (как в шаблоне VK Mini Apps).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

const viteRoot = dirname(fileURLToPath(import.meta.url));

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

function buildStampPlugin() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return {
    name: 'build-stamp',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          '<title>Seashell</title>',
          `<title>Seashell</title>\n    <!-- seashell-build: ${stamp} -->`,
        );
      },
    },
  };
}

function vkEarlyInitPlugin() {
  const initCode = readFileSync(join(viteRoot, 'public/vk-early-init.js'), 'utf8');
  const tag = `<script type="module">\n${initCode}\n</script>`;
  return {
    name: 'vk-early-init-inline',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<!-- seashell-build: [^>]+ -->/,
          (match) => `${match}\n    ${tag}`,
        );
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), '');
    if (!String(env.VITE_API_URL ?? '').trim()) {
      throw new Error(
        'Для npm run build / deploy нужен VITE_API_URL в seashell/.env.production (например https://api.sishel.ru)',
      );
    }
  }

  return {
    base: './',

    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
      allowedHosts: true,
      host: true,
      ...(process.env.VITE_TUNNEL === '1' ? { hmr: false } : {}),
    },

    plugins: [
      react(),
      threatJsFilesAsJsx(),
      handleModuleDirectivesPlugin(),
      legacy({
        targets: ['defaults', 'not IE 11'],
      }),
      buildStampPlugin(),
      vkEarlyInitPlugin(),
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
  };
});
