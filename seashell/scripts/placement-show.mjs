#!/usr/bin/env node
/**
 * Показать последние prod/stage URL из .deploy-urls.json (после npm run deploy).
 */
import { loadLastDeployUrls, printPlacementChecklist } from './placement-checklist.mjs';

const record = loadLastDeployUrls();

if (!record) {
  console.error('');
  console.error('Нет файла .deploy-urls.json — сначала выполните: npm run deploy');
  console.error('');
  process.exit(1);
}

printPlacementChecklist(record);
