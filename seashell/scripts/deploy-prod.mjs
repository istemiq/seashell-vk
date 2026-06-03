#!/usr/bin/env node
/** Production deploy: MINI_APPS_ENVIRONMENT=production для vk-miniapps-deploy */
process.env.MINI_APPS_ENVIRONMENT = 'production';
await import('./vk-deploy.mjs');
