# Восстановление словаря пользователей

## Что произошло (не deploy фронта)

Деплой VK Hosting **не трогает** базу данных. Слова не привязаны к хэшу `pages-ac`.

Раньше API на VPS мог хранить слова в **SQLite** (`data/words.db`). Сейчас работает **PostgreSQL** (`DATABASE_URL` в `.env`). При смене хранилища **автоматической миграции не было** — PostgreSQL мог остаться пустым, пока слова лежат в старом `words.db`.

Попытки «Добавить слово» с ошибками **401 / GigaChat 429** в Postgres **не записывались** (сначала GigaChat, потом INSERT).

## Шаг 1. Найти старую базу на VPS

```bash
ssh root@155.212.141.148
find /root /data /var -name "words.db" 2>/dev/null
ls -la /root/seashell-server-new/data/words.db /root/seashell/server/data/words.db 2>/dev/null
```

Если файл **> 0 байт** — слова, скорее всего, там.

## Шаг 2. Проверить PostgreSQL

```bash
sudo -u postgres psql seashell -c "SELECT COUNT(*) FROM words;"
sudo -u postgres psql seashell -c "SELECT vk_user_id, COUNT(*) FROM words GROUP BY vk_user_id;"
```

## Шаг 3. Импорт SQLite → PostgreSQL

С **ПК** скопировать скрипт:

```powershell
scp C:\Users\Пайчармик\seashell_vk\seashell\server\scripts\import-sqlite-to-postgres.js root@155.212.141.148:/root/seashell-server-new/scripts/import-sqlite-to-postgres.js
```

На **VPS**:

```bash
cd /root/seashell-server-new
node scripts/import-sqlite-to-postgres.js
# или явный путь:
node scripts/import-sqlite-to-postgres.js /root/seashell/server/data/words.db
```

Скрипт выведет, сколько слов импортировано по каждому `vk_user_id`.

## Шаг 4. Проверка в приложении

1. Закрыть мини-приложение полностью.
2. Открыть https://vk.com/app54526886
3. Словарь — должны появиться старые слова.

## Если words.db нет

1. Снимок VPS у хостера (backup на дату, когда слова ещё были).
2. Локальный ПК: поиск `words.db` в копиях проекта.
3. `pg_dump` бэкапы на сервере: `find / -name "*.sql" -o -name "*.dump" 2>/dev/null`

## На будущее

- Перед сменой БД: `pg_dump` / копия `words.db`.
- После деплоя API: проверять `SELECT COUNT(*) FROM words`, а не только `/api/health`.
