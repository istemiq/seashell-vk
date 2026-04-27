/**
 * Диагностика GIGACHAT_API_KEY без вывода самого ключа.
 * Запуск: из каталога server: npm run check-gigachat
 */
import '../load-env.js';

const raw = (process.env.GIGACHAT_API_KEY || '').trim();
const len = raw.length;

if (!raw) {
  console.log('GIGACHAT_API_KEY: (пусто или не задан)');
  process.exit(1);
}

let decoded = '';
try {
  decoded = Buffer.from(raw, 'base64').toString('utf8');
} catch {
  console.log('GIGACHAT_API_KEY: не удалось декодировать как base64');
  process.exit(1);
}

const colonCount = (decoded.match(/:/g) || []).length;
const hasWs = /\s/.test(decoded);

console.log('GIGACHAT_API_KEY (маска): длина строки в .env =', len);
console.log('После base64-decode: длина =', decoded.length, '| двоеточий =', colonCount, '| есть пробелы/переносы =', hasWs);
console.log('Ожидание GigaChat: ровно одно «:» между client_id и client_secret, без пробелов.');
if (colonCount !== 1 || hasWs) {
  console.log("Статус: формат decoded-строки, скорее всего, неверный → OAuth «Can't decode Authorization».");
  process.exit(1);
}
console.log('Статус: формат decoded-строки похож на client_id:client_secret.');
