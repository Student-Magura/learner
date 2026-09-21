# Learner

PWA, що перетворює папку Google Drive у відеокурс із відстеженням прогресу.
Прогрес зберігається локально й синхронізується між пристроями через приховану
папку застосунку у Drive самого користувача. Бекенду немає.

## Запуск

1. Налаштувати Google Cloud за `docs/google-cloud-setup.md`
2. `cp .env.example .env.local` і вписати `VITE_GOOGLE_CLIENT_ID`
3. `npm install`
4. `npm run dev`

## Команди

| Команда | Що робить |
|---|---|
| `npm run dev` | дев-сервер |
| `npm test` | усі тести |
| `npm run build` | типізація + продакшн-збірка |

## Документи

- Дизайн: `docs/superpowers/specs/2026-09-20-drive-course-player-design.md`
- План реалізації: `docs/superpowers/plans/2026-09-20-drive-course-player.md`
- Результат спайка про Service Worker: `docs/superpowers/plans/2026-09-20-spike-result.md`
