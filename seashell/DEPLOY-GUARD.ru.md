# Защита от «deploy прошёл, у пользователей не работает»

## Три правила

1. **Черновик (только вы):** `npm.cmd run deploy` — stage; prod может быть 403 — это ожидаемо.
2. **Выкладка для всех:** `npm.cmd run deploy:prod` — скрипт проверит prod HTTP **200**. Если 403 — **ошибка**, в консоли будет **stage URL для prod-полей**.
3. **`deploy:prod`** — обязательно **код с телефона** (`Deploy confirmed` / `URLs changed for production` в логе). Без этого prod CDN часто **403**.
4. **`update_prod: 1`** — иначе VK не публикует prod и **не спросит код с телефона**. После deploy сверьте `verify:hosting`; при prod 403 не оставляйте новый prod URL в размещении.

## Prod vs stage

| Цель | Действие |
|------|----------|
| **Снова открыть приложение на prod CDN** | `npm run placement:restore-prod` → prod `25a3c6dd9866` (pages-ac) |
| **Выкатить новый код на prod** | `deploy:prod` + код с телефона → prod HTTP **200** → prod URL в размещении |
| **Новый код, prod ещё 403** | временно stage в prod-полях — только пока ждёте prod 200 |

## Если prod 403 после deploy

```powershell
npm.cmd run placement:recovery
```

В **prod-поля** размещения вставьте **stage URL** с тем же хешом (новая сборка) → Сохранить.  
Не делайте второй deploy подряд.

## Не считать успехом

| Симптом | Значение |
|---------|----------|
| «Deploy success» в логе | Только заливка zip |
| Stage 200, prod 403 | Пользователи **не** видят приложение |
| Dev mode вкл, у вас ок | Это **не** проверка для модерации |

## Команды

```powershell
npm.cmd run deploy:prod      # production + авто-проверка prod
npm.cmd run verify:hosting   # повторить проверку без deploy
npm.cmd run placement:show   # URL для dev.vk → Размещение
```

## Если deploy:prod упал на verify

- Не крутить deploy подряд (лимит 24/сутки).
- Временно: stage URL в prod-полях (тот же хеш) — см. MODERATION-RUSH.ru.md.
- Тикет VK: app 54526886, prod 403, stage 200.
