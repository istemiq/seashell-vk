#!/usr/bin/env node
/**
 * Проверка VK_APP_SECRET на сервере.
 * Вставьте строку из DevTools → Network → X-VK-Launch-Params (без секретов в чат!).
 *
 *   node scripts/verify-vk-secret.js 'vk_user_id=...&vk_app_id=54526886&...&vk_sign=...'
 */
import '../load-env.js';
import { verifyVkLaunchParams } from '../vkSignature.js';

const qs = process.argv[2]?.trim();
const secret = String(process.env.VK_APP_SECRET ?? '').trim();

if (!qs) {
  console.error('Usage: node scripts/verify-vk-secret.js "<launch params query string>"');
  process.exit(1);
}
if (!secret) {
  console.error('VK_APP_SECRET пуст в .env');
  process.exit(1);
}

const r = verifyVkLaunchParams(qs, secret);
console.log(r.ok ? 'OK — подпись совпала' : `FAIL — ${r.reason}`);
if (!r.ok) {
  console.error('Сверьте защищённый ключ в dev.vk с VK_APP_SECRET в .env');
  process.exit(1);
}
