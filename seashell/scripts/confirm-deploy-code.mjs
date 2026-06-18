#!/usr/bin/env node
/** Подтверждение production-deploy кодом из VK (apps.confirmDeploy). */
import Configstore from 'configstore';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(
  readFileSync(join(root, 'node_modules/@vkontakte/vk-miniapps-deploy/package.json'), 'utf8'),
);
const vault = new Configstore(pkg.name, {});
const token = vault.get('access_token');
const code = process.argv[2];
const version = process.argv[3] || '1781767792';
const appId = 54526886;

if (!code) {
  console.error('Usage: node scripts/confirm-deploy-code.mjs <code> [version]');
  process.exit(1);
}
if (!token) {
  console.error('No access_token in vk-miniapps-deploy vault. Run deploy once interactively.');
  process.exit(1);
}

const url = new URL('https://api.vk.ru/method/apps.confirmDeploy');
url.searchParams.set('access_token', token);
url.searchParams.set('v', '5.131');
url.searchParams.set('app_id', String(appId));
url.searchParams.set('version', String(version));
url.searchParams.set('code', String(code));

const res = await fetch(url);
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
process.exit(json.error ? 1 : 0);
