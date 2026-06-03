# Basic [VK Bridge](https://github.com/VKCOM/vk-bridge) + [VKUI](https://github.com/VKCOM/VKUI) + [VK Miniapps Router](https://github.com/VKCOM/vk-mini-apps-router) app

Этот шаблон предоставляет базовый код и настройки для создания мини-приложения внутри ВКонтакте.  
В качестве сборщика проекта выступает [Vite](https://vite-docs-ru.vercel.app/guide/), подробнее про его конфигурацию и дополнительные плагины можно прочитать [здесь](https://vite-docs-ru.vercel.app/config/) и [здесь]().

**Зависимости (npm), два `package.json`, скрипты и частые ошибки** — см. подробный гайд **[DEPENDENCIES.md](./DEPENDENCIES.md)**.

## 🚀 Запуск мини приложения

Запустите ваш мини апп

```sh
 yarn start
```

Перейдите на [devportal](https://dev.vk.ru/ru) или в [управление](https://vk.ru/apps?act=manage) и создайте новый мини апп.  
Вставьте URL на котором работает ваше приложение в настройки, предварительно включив режим разработки.
Теперь можете открыть мини апп, нажав на его иконку.
Список всех созданных вами мини приложений вы сможете найти [тут](https://vk.ru/apps?act=manage) или [тут](https://dev.vk.ru/ru/admin/apps-list).

## 🌐 Деплой мини приложения

Для того чтобы поделиться приложением запущенным на localhost со своими друзьями, вы можете скачать утилиту vk-tunnel и запустить уже подготовленный скрипт из package.json

```sh
yarn global add @vkontakte/vk-tunnel
yarn run tunnel
```

После чего вы получите ссылку, по которой ваше приложение будет доступно с любого устройства, подробнее про vk-tunnel можно прочитать [тут](https://dev.vk.ru/ru/libraries/tunnel).

Для того чтобы захостить ваше приложение на сервера ВКонтакте нужно зайти в vk-hosting-config.json и указать id вашего приложения. Далее можно запустить уже подготовленный скрипт:

```sh
yarn run deploy
```

После чего, вы получите бессрочную ссылку на ваш мини апп.

## Seashell: продакшен перед модерацией VK

**Полная пошаговая инструкция (сервер, Nginx, env, сборка, деплой, иконка, проверки):** [DEPLOY-STEPS.ru.md](./DEPLOY-STEPS.ru.md).

Краткий чеклист ниже — детали в документе по ссылке.

Цель раздела: один проход без догадок «почему API 401/CORS».

1. **Сервер API (отдельно от статики)**  
   PostgreSQL, HTTPS (обратный прокси + сертификат), проброс порта или `PORT` через переменную.

2. **Переменные бэкенда** — см. шаблон [server/.env.example](./server/.env.example):  
   `DATABASE_URL`, `GIGACHAT_API_KEY`, **`VK_APP_SECRET`**, **`CORS_ORIGINS`** (обычно `https://vk.com,https://m.vk.com,https://web.vk.com`; при ошибках проверь `Origin` в Network и добавь домен через запятую), `NODE_ENV=production`.

3. **Сборка фронта** — скопируй [.env.production.example](./.env.production.example) в `.env.production`, пропиши **`VITE_API_URL`** своим доменом API, затем из каталога `seashell`:  
   `npm run build`

4. **Статический хостинг VK** — `vk-hosting-config.json` уже указывает `build`. Команда: `npm run deploy` (понадобится `MINI_APPS_ACCESS_TOKEN` в окружении или при запросе утилиты).  
   После deploy: `npm run verify:hosting` (prod должен быть **200**), затем `npm run placement:show` и [Размещение](https://dev.vk.com/admin/app-54526886/placement) → **Сохранить**. Production-выкладка: `npm run deploy:prod`. Срочно перед модерацией: [MODERATION-RUSH.ru.md](./MODERATION-RUSH.ru.md).

5. **Иконка в кабинете приложения VK** — в настройках/модерации загрузи PNG квадрат (часто просят **278×278** и меньшие). Из `public/logo.svg` экспортировать в редакторе или любым rasterizer.

6. **В кабинете VK**: описание приложения, ссылка на политику приватности если требуется формуляром, включённые платформы (мобильный веб и т.д.).

## 🗂️ Предустановленные библиотеки

Мы подготовили для вас набор пакетов, с которыми вам будет легко начать разрабатывать мини аппы
| Пакет | Назначение |
| ------ | ------ |
| [vk-bridge](https://dev.vk.ru/ru/mini-apps/bridge) | Библиотека для отправки команд и обмена данными с платформой ВКонтакте. |
| [VKUI](https://vkcom.github.io/VKUI/) | Библиотека React-компонентов для создания мини-приложений в стиле ВКонтакте. |
| [vk-bridge-react](https://www.npmjs.com/package/@vkontakte/vk-bridge-react) | Пакет, который даёт возможность использовать события библиотеки VK Bridge в React-приложениях. |
| [vk-mini-apps-router](https://dev.vk.ru/ru/libraries/router) | Библиотека для маршрутизации и навигации в мини-приложениях, созданных с помощью VKUI. |
| [icons](https://vkcom.github.io/icons/) | Набор иконок для использования в компонентах VKUI. |
| [vk-miniapps-deploy](https://dev.vk.ru/ru/mini-apps/development/hosting) | Пакет для размещения файлов мини-приложения на хостинге ВКонтакте. |
| [eruda](https://www.npmjs.com/package/eruda) | Консоль для мобильного браузера|

## 📎 Полезные ссылки

[Dev портал разработчиков](https://dev.vk.ru/ru)  
[Пример мини приложения](https://dev.vk.ru/ru/mini-apps/examples/shop)  
[Если столкнулись с проблемами](https://github.com/VKCOM/create-vk-mini-app/issues)
