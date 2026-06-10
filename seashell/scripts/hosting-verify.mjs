/**
 * HTTP-проверка prod/stage после deploy.
 */
import { spawnSync } from 'node:child_process';

export async function fetchIndexStatus(url) {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'curl.exe',
      ['-sS', '-o', 'NUL', '-w', '%{http_code}', url],
      { encoding: 'utf8',
        timeout: 30000 },
    );
    const code = Number.parseInt(String(r.stdout ?? '').trim(), 10);
    if (Number.isFinite(code)) return code;
    return `ERR ${r.stderr?.trim() || r.error?.message || 'curl'}`;
  }

  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

/**
 * @param {{ prod?: string, stage?: string }} record
 * @param {{ requireProd?: boolean }} options
 */
export async function verifyHostingRecord(record, { requireProd = false } = {}) {
  const { prod, stage } = record ?? {};
  if (!prod || !stage) {
    return {
      ok: false,
      prodCode: null,
      stageCode: null,
      message: 'В логе deploy не найдены prod/stage URL.',
    };
  }

  const [prodCode, stageCode] = await Promise.all([
    fetchIndexStatus(prod),
    fetchIndexStatus(stage),
  ]);

  const prodOk = prodCode === 200;
  const stageOk = stageCode === 200;

  if (requireProd) {
    if (prodOk && stageOk) {
      return {
        ok: true,
        prodCode,
        stageCode,
        message: 'Prod и stage отдают 200 — можно обновлять размещение.',
      };
    }
    if (prodCode === 403 && stageOk) {
      return {
        ok: false,
        prodCode,
        stageCode,
        prodBroken: true,
        message:
          'Prod 403, stage 200 — production-контур VK не отдал файлы. ' +
          'Размещение НЕ менять на этот prod URL.',
      };
    }
    return {
      ok: false,
      prodCode,
      stageCode,
      message: `Prod не готов (HTTP ${prodCode}).`,
    };
  }

  if (!prodOk && stageOk) {
    return {
      ok: true,
      prodCode,
      stageCode,
      warn: true,
      message:
        'Stage 200, prod не 200 — нормально для чернового deploy. ' +
        'Для пользователей — только deploy:prod с prod HTTP 200.',
    };
  }

  if (prodOk && stageOk) {
    return { ok: true, prodCode, stageCode, message: 'Prod и stage отдают 200.' };
  }

  return {
    ok: false,
    prodCode,
    stageCode,
    message: `Проверка не пройдена (prod ${prodCode}, stage ${stageCode}).`,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Prod иногда поднимается с задержкой после deploy — ждём перед отказом.
 */
export async function waitForProdReady(
  prodUrl,
  { attempts = 12, intervalMs = 15000 } = {},
) {
  for (let i = 1; i <= attempts; i += 1) {
    const code = await fetchIndexStatus(prodUrl);
    console.log(`  [wait prod] попытка ${i}/${attempts}: HTTP ${code}`);
    if (code === 200) return { ok: true, prodCode: code, attempts: i };
    if (i < attempts) await sleep(intervalMs);
  }
  const prodCode = await fetchIndexStatus(prodUrl);
  return { ok: false, prodCode, attempts };
}

export function printHostingVerifyResult(record, result) {
  console.log('');
  console.log('─'.repeat(60));
  console.log('  Проверка хостинга VK (index.html)');
  console.log('─'.repeat(60));
  if (record?.prod) console.log(`  prod:  ${record.prod}`);
  if (record?.stage) console.log(`  stage: ${record.stage}`);
  console.log('');
  console.log(`  prod HTTP:  ${result.prodCode}`);
  console.log(`  stage HTTP: ${result.stageCode}`);
  console.log('');
  if (result.ok && !result.warn) {
    console.log(`  ✓ ${result.message}`);
  } else if (result.ok && result.warn) {
    console.log(`  ⚠ ${result.message}`);
  } else {
    console.log(`  ✗ ${result.message}`);
  }
  console.log('─'.repeat(60));
  console.log('');
}
