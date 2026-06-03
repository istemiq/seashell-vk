# Seashell — быстрый путь к модерации (prod 403)

**Сейчас:** stage отдаёт **200**, prod на `pages-ac` — **403**. Пользователи без режима разработки видят «приложение не обнаружено».

API (`https://api.sishel.ru/api/health`) — ок, менять не нужно.

---

## За 15–20 минут (порядок строгий)

### 1. Одна выкладка production

PowerShell, каталог `seashell`.

Если ошибка *«running scripts is disabled»* — используйте **`npm.cmd`** вместо `npm` (ниже уже так).

```powershell
cd C:\Users\Пайчармик\seashell_vk\seashell
$env:MINI_APPS_ACCESS_TOKEN = "ВАШ_ТОКЕН"
npm.cmd run deploy:prod
```

Альтернатива только на эту сессию:  
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

Подтвердите вопросы CLI (`y`). Дождитесь **Deploy success** и строк с `prod-app…pages-ac…`.

### 2. Проверка без браузера

```powershell
npm.cmd run verify:hosting
```

Нужно: **prod HTTP: 200**. Если снова **403** — не делайте второй deploy сразу (лимит 24/сутки).

### 3. Размещение

```powershell
npm run placement:show
```

1. [Размещение](https://dev.vk.com/admin/app-54526886/placement)
2. **Prod-поля** (mobile, web, m.vk) → URL из блока PRODUCTION (`pages-ac.vk-apps.com`)
3. **Stage-поля** → URL из блока STAGE
4. **Сохранить**
5. Режим разработки **выкл** → открыть `https://vk.com/app54526886` с телефона

### 4. Смоук перед модерацией

- [ ] Открывается без «App not detected»
- [ ] Словарь грузится
- [ ] Политика конфиденциальности в приложении

---

## Срочный обход (если после deploy prod всё ещё 403, а stage 200)

Если в `npm run placement:show` **хеш prod = stage** (одинаковый фрагмент в URL):

1. В **prod-полях** размещения вставьте **STAGE** URL (`stage-app…pages.vk-apps.com`, без `-ac`).
2. Сохранить → проверить `vk.com/app54526886` (dev mode off).

Это тот же билд, другой CDN-контур. Для модерации часто достаточно, пока VK не починит `pages-ac`. Когда `verify:hosting` покажет prod:200 — верните prod URL в prod-поля.

---

## Если prod так и 403

1. **dev.vk** → приложение → раздел **Хостинг / Версии** (если есть) — активировать последнюю **production**-версию.
2. Тикет в поддержку VK: app **54526886**, stage **200**, prod **403**, hash из `.deploy-urls.json`.
3. Запасной план: свой HTTPS для `build/` (см. переписку) — 1–2 часа на nginx + CORS.

---

## Не делать перед модерацией

- Много deploy подряд без `npm run verify:hosting`
- Тест только с dev mode **вкл** (вы видите stage, пользователи — prod)
- Сохранять размещение со старым хешом после нового deploy

Повторить проверку: `npm run verify:hosting` и `npm run placement:show`.
