# Приймальна перевірка — результати

> **Стан: вимірювання очікують виконання.** Критерії 1–6 вимагають інтерактивного
> входу в Google з реальним обліковим записом, налаштованого OAuth-клієнта
> (`VITE_GOOGLE_CLIENT_ID`) та, для критеріїв 4–5, двох фізичних пристроїв.
> Жодне з цього автоматизований агент виконати не може. Ці рядки навмисно
> залишені порожніми — їх заповнює **людина**, яка виконає кроки 2–7 брифа
> задачі 17 (`task-17-brief.md`) вручну на реальному курсі.
>
> Критерій 7 (юніт-тести) — єдиний пункт, виконаний автоматично; результати
> нижче отримані реальним запуском команд.

| # | Критерій | Результат | Примітки |
|---|---|---|---|
| 1 | Курс за посиланням на папку Drive додається й показує коректне дерево з прикладу (4 модулі, вкладені підрозділи, без `.DS_Store`). | | |
| 2 | Відео відтворюється у власному плеєрі; закриття й повторне відкриття продовжує з тієї ж секунди. | | |
| 3 | Курс показує відсоток за часом, що агрегується на всіх рівнях дерева. | | |
| 4 | Прогрес, зроблений у Chrome на десктопі, з'являється на телефоні після перезавантаження. | | |
| 5 | Перегляд на двох пристроях в одну сесію не затирає взаємно. | | |
| 6 | При штучно зламаному основному шляху плеєр сам перемикається на iframe із ручною відміткою. | | |
| 7 | Юніт-тести на агрегацію, merge і сканер проходять. | пройдено | Див. фактичний вивід нижче. |

## Критерій 7 — фактичний вивід команд

Команди виконані 2026-09-21 у `/Users/student/projects/Claude/learner/.claude/worktrees/drive-course-player`.

### `npm test`

```
 RUN  v5.0.1 /Users/student/projects/Claude/learner/.claude/worktrees/drive-course-player

 Test Files  18 passed (18)
      Tests  183 passed (183)
```

### `npm run build`

```
> drive-course-player@1.0.0 build
> tsc --noEmit && vite build

✓ 50 modules transformed.
dist/registerSW.js                0.14 kB
dist/manifest.webmanifest         0.51 kB
dist/index.html                   0.58 kB │ gzip:  0.34 kB
dist/assets/index-CgFEsnE9.css    7.51 kB │ gzip:  2.35 kB
dist/assets/index-D45y12TR.js   281.08 kB │ gzip: 89.60 kB
✓ built in 234ms

PWA v1.3.0
Building src/sw/service-worker.ts service worker ("es" format)...
✓ 54 modules transformed.
dist/service-worker.mjs  16.53 kB │ gzip: 5.64 kB
✓ built in 10ms

PWA v1.3.0
mode      injectManifest
format:   es
precache  10 entries (286.61 KiB)
files generated
  dist/service-worker.js
```

Збірка чиста — жодних помилок TypeScript чи попереджень збірника (окрім
нешкідливого `inlineDynamicImports option is deprecated` від Vite/Rollup щодо
сервіс-воркера, не пов'язаного з кодом застосунку).

### Три цільові файли тестів (агрегація, merge, сканер)

`npx vitest run src/progress/aggregate.test.ts`

```
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

`npx vitest run src/storage/mergeProgress.test.ts`

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

`npx vitest run src/drive/courseScanner.test.ts`

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Що залишилось поза цим прогоном

- Кроки 2–7 брифа (критерії 1–6, офлайн-перевірка) — не виконані, потребують
  людини з реальним акаунтом Google, налаштованим OAuth-клієнтом і (для
  критеріїв 4–5) двома пристроями.
- `spike.html`, `public/sw-spike.js` та
  `docs/superpowers/plans/2026-09-20-spike-result.md` — тестовий стенд для
  перевірки Service Worker медіа-проксі на реальному iPhone; перевірка ще не
  відбулась, файли навмисно залишені без змін.
