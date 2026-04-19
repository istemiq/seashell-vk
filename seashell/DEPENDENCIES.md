# Зависимости проекта Seashell (для новичка)

Этот документ объясняет **зачем** нужен каждый пакет и **как устроена установка**. Код лежит в папке `seashell/` (от корня репозитория).

---

## 1. Что нужно установить на компьютер

| Что | Зачем | Версия |
|-----|--------|--------|
| **Node.js** | Запуск JavaScript на сервере и сборка фронтенда | **22.5+** (в `server/package.json` указано `engines.node`) |
| **npm** | Идёт вместе с Node, ставит пакеты из `package.json` | Любая свежая |

Проверка в терминале:

```bash
node -v
npm -v
```

---

## 2. Два `package.json` — не путать

В проекте **два** файла зависимостей:

| Файл | Роль |
|------|------|
| **`seashell/package.json`** | Главный: React, Vite, VK UI, скрипт `npm run dev` (фронт + команда на API) |
| **`seashell/server/package.json`** | Только сервер: Express, CORS, dotenv |

**Важно:** зависимости ставятся **из каталога `seashell`**, одной командой:

```bash
cd seashell
npm install
```

Эта команда:

1. Читает **`seashell/package.json`** и создаёт **`seashell/node_modules/`** (фронт + общие пакеты).
2. **Не** ставит автоматически зависимости из `server/package.json`, если не настроен npm workspaces.

**Как сейчас устроено в репозитории:** `npm run api` запускает `node server/index.js` из **корня seashell**. Node ищет модули в `seashell/node_modules`, поэтому **`undici`** (для GigaChat) объявлен в **корневом** `seashell/package.json`, а не только в `server/package.json`. Серверные `express`, `cors`, `dotenv` нужно иметь доступными — их ставит либо отдельный `npm install` внутри `server/`, либо они должны быть в корневом `node_modules` после вашей схемы установки.

**Практическая рекомендация для новичка:**

```bash
cd seashell
npm install
cd server
npm install
cd ..
```

После этого и фронт, и API при `npm run dev` найдут все модули.

---

## 3. Скрипты в `seashell/package.json`, поле `scripts`

| Скрипт | Что делает |
|--------|------------|
| **`npm run dev`** | Запускает **одновременно** API (`node server/index.js`, порт 3001) и Vite (порт 5173). Основной режим разработки. |
| **`npm start`** | Только Vite (фронт). API нужно поднять отдельно: `npm run api`. |
| **`npm run api`** | Только Express API. |
| **`npm run build`** | Сборка фронта в `build/` для продакшена. |
| **`npm run lint`** | Проверка кода ESLint. |
| **`npm run deploy`** | Сборка + выкладка VK Mini Apps (нужен VK-инструмент). |

---

## 4. Зависимости фронтенда (`dependencies` в `seashell/package.json`)

Эти пакеты **нужны в продакшене** (попадают в сборку или в рантайм).

| Пакет | Зачем |
|-------|--------|
| **react** / **react-dom** | UI на компонентах. |
| **@vkontakte/vkui** | Готовые компоненты интерфейса в стиле VK. |
| **@vkontakte/vk-bridge** | Связь с клиентом VK (пользователь, тема, токены и т.д.). |
| **@vkontakte/vk-bridge-react** | Хуки (`useAppearance`, `useInsets` и др.) для React. |
| **@vkontakte/vk-mini-apps-router** | Маршрутизация по панелям (какие экраны показывать). |
| **@vkontakte/icons** | Иконки (если используются в разметке). |
| **prop-types** | Проверка типов пропсов в React (как документация в коде). |
| **undici** | HTTP-клиент (используется на **сервере** в `gigachat.js` для запросов к GigaChat; в корневом `package.json`, чтобы `node server/index.js` находил модуль из `seashell/node_modules`). |

---

## 5. Dev-зависимости (`devDependencies` в `seashell/package.json`)

Нужны **только при разработке**, в финальный бандл для пользователя обычно не входят (кроме того, что подключает Vite).

| Пакет | Зачем |
|-------|--------|
| **vite** | Сборщик и dev-сервер с HMR. |
| **@vitejs/plugin-react** | Поддержка JSX и Fast Refresh. |
| **@vitejs/plugin-legacy** | Старые браузеры (если включён в `vite.config.js`). |
| **esbuild** | Трансформация JS/JSX (используется цепочкой Vite). |
| **@vkontakte/vk-miniapps-deploy** | Выкладка мини-приложения. |
| **@vkontakte/vk-tunnel** | Туннель для тестов в VK. |
| **concurrently** | Запуск `api` и `vite` параллельно в `npm run dev`. |
| **eruda** | Консоль отладки в мобильном WebView (подключается в dev в `main.js`). |
| **eslint** + плагины | Статический анализ кода. |
| **terser** | Минификация (часто через legacy). |

---

## 6. Зависимости API (`seashell/server/package.json`)

| Пакет | Зачем |
|-------|--------|
| **express** | HTTP-сервер, маршруты `/api/...`. |
| **cors** | Ответы с другого origin (браузер + Vite proxy). |
| **dotenv** | Чтение `server/.env` (через `load-env.js` также читается `seashell/.env`). |

**Встроенные модули Node (не в `package.json`):**

| Модуль | Зачем |
|--------|--------|
| **`node:sqlite`** | База SQLite (`words.db`) — доступен в **Node 22.5+** как встроенный. |
| **`fs`**, **`path`**, **`crypto`**, **`url`** | Стандартная библиотека Node. |

---

## 7. Переменные окружения и секреты

Секреты **не** коммитятся. Шаблоны в репозитории:

- `seashell/.env.example`
- `seashell/server/.env.example`

Скопируй в `.env` и заполни. Подробности — в `server/DEPLOY.txt` и комментариях в `server/load-env.js`.

---

## 8. Где что искать в коде (карта)

| Область | Файлы |
|---------|--------|
| Точка входа фронта | `src/main.js` → `AppConfig.js` → `App.js` |
| Маршруты | `src/routes.js` |
| Панели | `src/panels/*.js` |
| API словаря | `src/api/dictionaryApi.js` → `server/index.js` + `db.js` |
| Говорящая практика | `src/api/practiceApi.js` → `server/index.js` + `gigachat.js` |
| GigaChat | `server/gigachat.js`, промпты в `server/prompts/` |
| База данных | `server/db.js`, файл `server/data/words.db` (создаётся сам) |

---

## 9. Частые проблемы

1. **`npm run dev` не находит модуль** — выполни `npm install` в `seashell` и при необходимости в `seashell/server`.
2. **Порт 3001 занят** — закрой старый процесс Node или поменяй `PORT` в `.env`.
3. **API 401** — фронт должен слать заголовок `X-VK-User-Id`; в браузере без VK задаётся fallback (см. `dictionaryApi.js` / `vkUserId.js`).
4. **GigaChat / TLS** — см. `server/.env.example` и логи `load-env`.

---

---

## 10. Связь с `package.json`

Числа версий (`^3.1.1` и т.д.) смотри в **`seashell/package.json`** и **`seashell/server/package.json`** — это источник истины. Здесь объяснено **назначение**, а не точные номера (они меняются при `npm update`).

---

*Документ можно дополнять по мере развития проекта.*
