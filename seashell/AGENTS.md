# Инструкция для AI-агента: Seashell VK (не деплоить «через жопу»)

Читай **перед** любыми советами по деплою, VPS, prod 403 и «это виноват VK».

Пользователь: Windows + PowerShell (`npm.cmd`, не `npm`). Репозиторий локально: `C:\Users\Пайчармик\seashell_vk\seashell`.

---

## Главное правило

**Никогда не своди проблему только к VK.** Почти всегда цепочка из нескольких звеньев:

1. **Фронт** (сборка, `VITE_API_URL`, хостинг VK, размещение)
2. **Бэкенд** (путь на VPS, `.env`, `VK_APP_SECRET`, ответы роботу VK)
3. **VK** (CDN `pages-ac`, лимит 24 deploy/сутки, модерация, код с телефона)

Если prod 403 — ищи **все три**, не утешай «подождите VK».

---

## Константы проекта

| Что | Значение |
|-----|----------|
| App ID | `54526886` |
| API (prod) | `https://api.sishel.ru` |
| VPS SSH | `root@155.212.141.148` (hostname `uzzlnyowyi` **с Windows не резолвится** — только IP) |
| **Рабочий бэкенд на VPS** | `/root/seashell-server-new/` ← **НЕ** `/root/seashell/` |
| Процесс API | `pm2`, имя `seashell-api`, скрипт `/root/seashell-server-new/index.js` |
| systemd `seashell-api` | **Нет** — не предлагать `systemctl restart seashell-api` |
| Размещение VK | https://dev.vk.com/admin/app-54526886/placement |
| Настройки app | https://dev.vk.com/admin/app-54526886 |

---

## VPS: куда копировать и что править

### Частая ошибка агента

Пользователь правит `/root/seashell/server/.env` и копирует туда `index.js`, а **pm2 крутит другую папку**.

### Правильно

```bash
# Файлы
/root/seashell-server-new/index.js
/root/seashell-server-new/.env

# Диагностика
pm2 list
pm2 show seashell-api
ss -tlnp | grep 3001
ps aux | grep node
```

### Обновление бэкенда

**С ПК (PowerShell):**

```powershell
scp C:\Users\Пайчармик\seashell_vk\seashell\server\index.js root@155.212.141.148:/root/seashell-server-new/index.js
```

**На VPS:**

```bash
nano /root/seashell-server-new/.env   # секреты здесь
pm2 restart seashell-api
```

### Обязательные переменные в `.env` на VPS

```env
NODE_ENV=production
VK_APP_SECRET=<защищённый ключ из dev.vk, НЕ сервисный>
VK_REVIEWER_USER_ID=1
CORS_ORIGINS=https://vk.com,https://m.vk.com,https://web.vk.com,https://vk.ru,https://m.vk.ru
DATABASE_URL=...
GIGACHAT_API_KEY=...
PORT=3001
```

`VK_REVIEWER_USER_ID` — синтетический id без личных данных в БД (fallback для робота VK на GET `/api/words`, `/api/sets` с Origin `*.vk-apps.com`).

### Проверка бэкенда после правок

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s -w "\nHTTP: %{http_code}\n" \
  -H "Origin: https://stage-app54526886-test.pages.vk-apps.com" \
  http://127.0.0.1:3001/api/words
```

Ожидание: health `ok`, words **HTTP 200** (не 401).

---

## Два разных ключа VK (не путать!)

| Ключ в dev.vk → «Ключи доступа» | Куда | Для чего |
|----------------------------------|------|----------|
| **Защищённый ключ** | `VK_APP_SECRET` в `/root/seashell-server-new/.env` | Проверка `vk_sign` на API |
| **Сервисный ключ** | `$env:MINI_APPS_ACCESS_TOKEN` при деплое | `vk-miniapps-deploy` |

- `dev.vk.com/ru/access` — **404**, не отправлять туда.
- Для деплоя без ручного токена: удалить кэш `C:\Users\Пайчармик\.config\configstore\@vkontakte\vk-miniapps-deploy.json` и запустить deploy — откроется браузерная авторизация.

**Не путать** короткий/старый токен с полным сервисным ключом → `invalid access_token (4)`.

---

## Деплой фронта (Windows)

### Перед сборкой

Файл `seashell/.env.production`:

```env
VITE_API_URL=https://api.sishel.ru
```

Без этого API URL «вшивается» неправильно.

### `vk-hosting-config.json`

| `update_prod` | Когда |
|---------------|-------|
| `1` | **Перед** `deploy:prod` — публикация на `pages-ac` + код с телефона |
| `0` | **После** успешного prod 200 — чтобы `deploy:stage` не трогал prod |

### Команды

```powershell
cd C:\Users\Пайчармик\seashell_vk\seashell
$env:MINI_APPS_ACCESS_TOKEN = "<сервисный ключ>"
npm.cmd run deploy:prod
npm.cmd run verify:hosting
npm.cmd run placement:show
```

Только деплой без rebuild (если `build/` уже есть):

```powershell
node scripts/deploy-prod.mjs
```

### Критерий успеха (не обманывать пользователя)

| Симптом | Это успех? |
|---------|------------|
| `Deploy success` | Нет — только zip залит |
| Stage 200, prod 403 | **Нет** — пользователи не видят app |
| Prod 200 + stage 200 | **Да** — можно обновлять размещение |
| Dev mode вкл, у автора ок | **Нет** — не проверка для модерации |

В логе `deploy:prod` должны быть: `URLs changed for production`, prod URL на `pages-ac.vk-apps.com`.

Лимит VK: **~24 deploy в сутки** — не крутить подряд при 403.

---

## Размещение после успешного deploy

1. https://dev.vk.com/admin/app-54526886/placement
2. **Prod-поля** → URL из `placement:show` (`pages-ac.vk-apps.com`)
3. **Stage-поля** → stage URL (`pages.vk-apps.com`)
4. **Сохранить**
5. Проверка: https://vk.com/app54526886 — **режим разработки ВЫКЛ**

### Временный обход (prod 403, stage 200, тот же хеш)

В prod-поля вставить **stage URL** → Сохранить. Вернуть prod URL, когда `verify:hosting` покажет prod 200.

```powershell
npm.cmd run placement:restore-prod   # last known good prod CDN
npm.cmd run placement:recovery       # подсказки при 403
```

---

## Почему prod CDN блокировался (июнь 2026 — решено)

Робот VK при публикации на `pages-ac` открывает билд на `*.vk-apps.com` **без валидной `vk_sign`**. Фронт дергает `GET /api/words`, `/api/sets`. Бэкенд с `VK_APP_SECRET` отвечал **401** → VK не публиковал хэш → **403 на статику**.

Фикс в `server/index.js`: для GET с Origin/Referer `*.vk-apps.com` при плохой подписи — гостевой `VK_REVIEWER_USER_ID`, ответ 200 с пустым словарём. POST по-прежнему требует подпись.

**Статический curl prod index.html без JS** может давать 403 до прохождения проверки — это не отменяет необходимости чинить API.

---

## Реклама VK (не повторять баги)

- Вызывать **`VKWebAppShowBannerAd`**, не `CheckBannerAd` (Check = «уже показан»).
- Десктоп vk.com: `bridge.isEmbedded()` / `isIframe()`, не только `isWebView()`.
- Заглушка «реклама после модерации» у админа приложения — **норма VK**, не наш stub.

---

## Чего не делать агенту

1. ❌ «Это только VK, ваш код ни при чём» без проверки API 401, `.env`, пути на VPS, размещения.
2. ❌ Копировать файлы в `/root/seashell/` вместо `seashell-server-new`.
3. ❌ `ssh root@uzzlnyowyi` с Windows без IP.
4. ❌ Защищённый ключ в `MINI_APPS_ACCESS_TOKEN`.
5. ❌ Считать deploy успешным без **prod HTTP 200** в `verify:hosting`.
6. ❌ Оставлять `update_prod: 1` навсегда.
7. ❌ Второй `deploy:prod` сразу после prod 403.
8. ❌ Просить пользователя коммитить без запроса.

---

## Быстрый чеклист «полный цикл»

```
[ ] index.js → scp → /root/seashell-server-new/index.js
[ ] .env → VK_APP_SECRET + VK_REVIEWER_USER_ID=1 в seashell-server-new
[ ] pm2 restart seashell-api
[ ] curl words с Origin vk-apps → 200
[ ] .env.production → VITE_API_URL=https://api.sishel.ru
[ ] vk-hosting-config.json → update_prod: 1
[ ] MINI_APPS_ACCESS_TOKEN = сервисный ключ
[ ] npm.cmd run deploy:prod → код с телефона → prod 200
[ ] dev.vk placement → сохранить prod + stage URL
[ ] vk.com/app54526886 dev mode OFF → словарь грузится
[ ] vk-hosting-config.json → update_prod: 0
```

---

## См. также в репо

- `DEPLOY-GUARD.ru.md` — правила prod/stage
- `MODERATION-RUSH.ru.md` — срочный путь к модерации
- `DEPLOY-STEPS.ru.md` — полный онбординг

**Last known good prod (запасной):** `25a3c6dd9866` на `pages-ac` (см. `placement:restore-prod`).

**Текущий рабочий хэш (июнь 2026):** `2fccaaa19365` — prod и stage 200 после фикса бэкенда + deploy:prod.
