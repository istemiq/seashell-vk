#!/usr/bin/env node
/** Сборка для prod: фикс launch params, без рекламной интеграции. */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const indexPath = join(buildDir, 'index.html');

if (!existsSync(indexPath)) {
  console.error('✗ Нет build/index.html — сначала: npm run build');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const jsRel = html.match(/assets\/(index-[^"']+\.js)/)?.[1];
const cssRel = html.match(/assets\/(index-[^"']+\.css)/)?.[1];

if (!jsRel || !cssRel) {
  console.error('✗ В index.html не найдены assets/index-*.js / *.css');
  process.exit(1);
}

const js = readFileSync(join(buildDir, 'assets', jsRel), 'utf8');
const css = readFileSync(join(buildDir, 'assets', cssRel), 'utf8');

const STALE_JS = new Set(['index-B3VDmg2I.js', 'index-Br9YwzMQ.js']);

const checks = [
  { label: 'без рекламы (нет banner_location)', ok: !js.includes('banner_location') },
  { label: 'фикс mvk (сброс launch params)', ok: js.includes('removeItem') && js.includes('seashell_vk_launch_qs') },
  { label: 'компактная анимация (4.5vw в CSS)', ok: css.includes('4.5vw') },
  { label: 'не старый бандл B3VDmg2I/Br9YwzMQ', ok: !STALE_JS.has(jsRel) },
];

console.log(`Проверка сборки: ${jsRel}, ${cssRel}`);
let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.label}`);
  if (!c.ok) failed = true;
}

if (failed) {
  console.error('');
  console.error('Сборка не прошла проверку. Частые причины:');
  console.error('  • не сохранены файлы в редакторе перед build');
  console.error('  • deploy прошёл, но в dev.vk → Размещение остался старый prod URL');
  process.exit(1);
}

console.log('✓ Сборка подходит для prod deploy');
