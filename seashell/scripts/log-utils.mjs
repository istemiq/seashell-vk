/** Убирает ANSI-цвета из вывода vite/npm для читаемых .log файлов. */
export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

export function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
