# Командні каталоги й синхронізація бібліотеки — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Користувач додає за посиланням власні каталоги курсів (папки Drive, де кожна підпапка — курс), бачить кожен каталог окремою секцією, а список каталогів і власних курсів синхронізується між пристроями.

**Architecture:** Розділяємо «що обрав користувач» (підписки `Library`, синхронізуються через `learner-library.json` в `appDataFolder`) і «що лежить у Drive» (кеш: знімки каталогів і дерева курсів у IndexedDB). Чиста функція `planReconcile` порівнює підписки з кешем і каже, що сканувати й що стерти; стор виконує план чергою з одного проходу. Синхронізація з Drive виноситься в загальний `createDocSync`, який обслуговує і прогрес, і бібліотеку.

**Tech Stack:** Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`), Zustand 5, `idb` 8, Tailwind 3.4, Vitest 5 + Testing Library + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-13-team-catalogs-design.md`

**Робоча копія:** ворктрі `/Users/student/projects/Claude/learner/.claude/worktrees/drive-course-player`, гілка `worktree-drive-course-player`. Усі команди — звідси.

## Global Constraints

- **Прогрес не видаляється ніколи** — ні разом із курсом, ні з каталогом, ні під час міграції. Стирати можна лише кеш курсів (`courses`) і знімки каталогів (`catalogs`).
- Файл бібліотеки — `learner-library.json`; файл прогресу `learner-progress.json` формату не змінює.
- Ключі `meta` прогресу лишаються `remoteModifiedTime` і `pushedProgress`; бібліотека — `libraryRemoteModifiedTime` і `pushedLibrary`.
- Каталоги перевіряються на нові курси на старті й при поверненні вкладки у фокус — не частіше ніж раз на **10 хвилин** (`CATALOG_REFRESH_MS = 600_000`). Зміна бібліотеки з іншого пристрою опитує каталоги одразу.
- Не більше **4** сканувань курсів одночасно (`SCAN_CONCURRENCY = 4`).
- Локальна зміна підписки пишеться з `updatedAt = max(now, попередній.updatedAt + 1)` і пушиться одразу, без дебаунсу.
- ID папок Drive у фікстурах — від 20 символів `[A-Za-z0-9_-]`: `parseFolderId` коротші відкидає.
- Увесь текст інтерфейсу й коментарі — українською, у стилі наявного коду.
- Після кожної задачі `npm test` і `npm run build` зелені (збірка включає `tsc --noEmit`).

## Review Focus

1. **Годинники пристроїв розходяться.** Каталог, доданий на пристрої з годинником, що поспішає, мусить прибиратися з пристрою, чий годинник відстає. Тест — Задача 6, «прибирання перемагає підписку з годинником, що поспішає».
2. **Каталог прибрали, поки його курси ще скануються.** Курс, скан якого завершився вже після прибирання, не мусить лишитися в кеші. Тест — Задача 6, «курс каталогу, прибраного під час скану, не лишається в кеші».
3. **Офлайн або мережевий збій.** Він не мусить виглядати як «немає доступу»: знімок лишається, червоних попереджень немає. Тести — Задача 6, «офлайн лишає знімок каталогу без тривоги» і «мережевий збій скану позначається як failed».
4. **Оновлення наявної установки.** IndexedDB v1 із власними курсами й курсами вбудованого каталогу, зокрема коли вбудований каталог зі збірки вже прибрали. Нічого не губиться й не пересканьовується. Тести — Задача 2, блок «міграція v1 → v2».
5. **Курс одночасно власний і в каталозі.** Прибирання одного з двох не прибирає курс. Тести — Задача 4, «курс і власний, і в прибраному каталозі лишається», і Задача 6, «курс, доданий і як власний, після прибирання каталогу лишається».

## Контрольні точки для ручної перевірки

- **Після Задачі 8** — повний новий екран: діалоги, секції, стани. Потрібен `.env` з `VITE_GOOGLE_CLIENT_ID` (і, за бажанням, `VITE_CATALOG_FOLDER_ID`), далі `npm run dev`.
- **Після Задачі 9** — два браузерні профілі на одному акаунті: каталог і власний курс, додані в одному, з'являються в іншому; прибирання теж поширюється.

Задачі 1–7 видимих змін в інтерфейсі не дають (між 6 і 8 бібліотека тимчасово показує всі курси одним списком «Власні курси») — їх перевіряють тести.

---

## Карта файлів

| Файл | Відповідальність | Задача |
|---|---|---|
| `src/types.ts` | нові типи `Subscription`, `Library`, `CatalogEntry`, `CatalogSnapshot`, `CatalogPreview`; `Course.source` зникає | 1, 8 |
| `src/library/mergeLibrary.ts` | чисті `mergeLibrary`, `sameLibrary` | 1 |
| `src/library/parseLibrary.ts` | чиста валідація файлу бібліотеки | 1 |
| `src/storage/db.ts` | IndexedDB v2: стори `library`, `catalogs`, міграція v1 | 2 |
| `src/storage/docSync.ts` | загальний pull/merge/push одного JSON в `appDataFolder` | 3 |
| `src/storage/syncEngine.ts` | прогрес поверх `createDocSync` | 3 |
| `src/library/librarySync.ts` | бібліотека поверх `createDocSync` | 3 |
| `src/test/fakeAppData.ts` | `appDataFolder` у пам'яті для тестів | 3 |
| `src/library/reconcile.ts` | чисті `activeCatalogIds`, `ownCourseIds`, `planReconcile`, `catalogEntries` | 4 |
| `src/library/sections.ts` | чиста `buildSections` для UI | 5 |
| `src/store/useStore.ts` | стан бібліотеки, черга reconcile, нові дії | 6 |
| `src/app/services.ts` | `builtinCatalogId`, `librarySync`, БД з id вбудованого каталогу | 6 |
| `src/test/setup.ts` | поліфіл `showModal`/`close` для jsdom | 7 |
| `src/ui/Modal.tsx` | нативний `<dialog>` | 7 |
| `src/ui/AddCourseDialog.tsx` | діалог курсу | 7 |
| `src/ui/AddCatalogDialog.tsx` | діалог каталогу у два кроки | 7 |
| `src/ui/LibraryPage.tsx` | секції, кнопки, стани | 8 |
| `src/App.tsx` | підключення `buildSections` і нових дій | 6 (тимчасово), 8 |
| `docs/memory-bank/*.md` | оновлена документація | 9 |

---

### Task 1: Типи й чиста логіка бібліотеки

**Files:**
- Modify: `src/types.ts`
- Create: `src/library/mergeLibrary.ts`, `src/library/mergeLibrary.test.ts`
- Create: `src/library/parseLibrary.ts`, `src/library/parseLibrary.test.ts`
- Modify: `docs/superpowers/specs/2026-10-13-team-catalogs-design.md` (два уточнення моделі)

**Interfaces:**
- Produces:
  - `type Subscription = { kind: 'catalog' | 'course'; title: string; addedAt: number; updatedAt: number; removed: boolean }`
  - `type Library = Record<string, Subscription>`
  - `type CatalogEntry = { id: string; title: string }`
  - `type CatalogSnapshot = { id: string; title: string; courses: CatalogEntry[]; lastSyncedAt: number }`
  - `type CatalogPreview = { id: string; title: string; courses: CatalogEntry[] }`
  - `mergeLibrary(local: Library, remote: Library): Library`
  - `sameLibrary(a: Library, b: Library): boolean`
  - `parseLibrary(content: unknown): Library`

- [ ] **Step 1: Додати типи в `src/types.ts`**

Додати в кінець файлу (поле `Course.source` поки **не чіпати** — його прибирає Задача 8, коли зникнуть усі споживачі):

```ts
/**
 * Те, що користувач обрав сам: каталог або власний курс. Синхронізується між
 * пристроями через learner-library.json. Ключ у Library — Drive folderId.
 */
export type Subscription = {
  kind: 'catalog' | 'course';
  /** Назва папки на момент додавання — щоб на новому пристрої картка мала підпис ще до скану. */
  title: string;
  addedAt: number;
  /** epoch ms. Основа для per-entry last-write-wins. */
  updatedAt: number;
  /** Tombstone: «прибрати» мусить дійти до інших пристроїв. */
  removed: boolean;
};

export type Library = Record<string, Subscription>;

/** Підпапка каталогу — курс, відомий за назвою ще до сканування. */
export type CatalogEntry = { id: string; title: string };

/** Локальний кеш складу каталогу. Завжди перебудовується з Drive. */
export type CatalogSnapshot = {
  /** Drive folderId каталогу. */
  id: string;
  /** Назва папки Drive; порожня, поки каталог не опитано після міграції. */
  title: string;
  courses: CatalogEntry[];
  lastSyncedAt: number;
};

/** Що знайшлося за посиланням на каталог — показується до підтвердження. */
export type CatalogPreview = { id: string; title: string; courses: CatalogEntry[] };
```

- [ ] **Step 2: Написати падаючі тести `src/library/mergeLibrary.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mergeLibrary, sameLibrary } from './mergeLibrary';
import type { Library, Subscription } from '../types';

function sub(updatedAt: number, over: Partial<Subscription> = {}): Subscription {
  return { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt, removed: false, ...over };
}

describe('mergeLibrary', () => {
  it('бере записи, що є лише з одного боку', () => {
    expect(mergeLibrary({ a: sub(1) }, { b: sub(2) })).toEqual({ a: sub(1), b: sub(2) });
  });

  it('свіжіший віддалений запис перемагає', () => {
    const merged = mergeLibrary({ a: sub(1) }, { a: sub(2, { title: 'Нова' }) });
    expect(merged.a?.title).toBe('Нова');
  });

  it('свіжіший локальний запис перемагає', () => {
    const merged = mergeLibrary({ a: sub(3, { title: 'Тут' }) }, { a: sub(2, { title: 'Там' }) });
    expect(merged.a?.title).toBe('Тут');
  });

  it('при однаковому updatedAt лишається локальний', () => {
    const merged = mergeLibrary({ a: sub(5, { title: 'Тут' }) }, { a: sub(5, { title: 'Там' }) });
    expect(merged.a?.title).toBe('Тут');
  });

  it('свіже «прибрати» перемагає старе «додати»', () => {
    expect(mergeLibrary({ a: sub(1) }, { a: sub(2, { removed: true }) }).a?.removed).toBe(true);
  });

  it('повторне додавання знімає старий tombstone', () => {
    expect(mergeLibrary({ a: sub(3) }, { a: sub(2, { removed: true }) }).a?.removed).toBe(false);
  });

  it('не змінює аргументи', () => {
    const local: Library = { a: sub(1) };
    const remote: Library = { a: sub(2), b: sub(1) };
    mergeLibrary(local, remote);
    expect(local).toEqual({ a: sub(1) });
    expect(remote).toEqual({ a: sub(2), b: sub(1) });
  });
});

describe('sameLibrary', () => {
  it('однакові бібліотеки рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1) })).toBe(true);
  });

  it('різниця в одному полі — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1, { removed: true }) })).toBe(false);
  });

  it('різна кількість записів — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1), b: sub(1) })).toBe(false);
  });

  it('однакова кількість, але різні ключі — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { b: sub(1) })).toBe(false);
  });
});
```

- [ ] **Step 3: Написати падаючі тести `src/library/parseLibrary.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseLibrary } from './parseLibrary';

const valid = { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt: 2, removed: false };

describe('parseLibrary', () => {
  it('пропускає коректний запис', () => {
    expect(parseLibrary({ a: valid })).toEqual({ a: valid });
  });

  it.each([null, 'рядок', 42, [valid]])('вміст %p — порожня бібліотека', (content) => {
    expect(parseLibrary(content)).toEqual({});
  });

  it.each([
    ['невідомий kind', { ...valid, kind: 'playlist' }],
    ['NaN у updatedAt', { ...valid, updatedAt: NaN }],
    ['Infinity в addedAt', { ...valid, addedAt: Infinity }],
    ['немає removed', { kind: 'course', title: 'x', addedAt: 1, updatedAt: 1 }],
    ['title не рядок', { ...valid, title: 7 }],
    ['не обʼєкт', 'catalog'],
  ])('відкидає запис (%s), лишаючи сусідній', (_name, broken) => {
    expect(parseLibrary({ bad: broken, good: valid })).toEqual({ good: valid });
  });

  it('прибирає зайві поля з чужого файлу', () => {
    expect(parseLibrary({ a: { ...valid, injected: '<script>' } })).toEqual({ a: valid });
  });
});
```

- [ ] **Step 4: Переконатися, що тести падають**

Run: `npx vitest run src/library`
Expected: FAIL — `Failed to resolve import "./mergeLibrary"` / `"./parseLibrary"`.

- [ ] **Step 5: Реалізувати `src/library/mergeLibrary.ts`**

```ts
import type { Library, Subscription } from '../types';

/**
 * Зливає підписки per-entry last-write-wins за updatedAt — так само, як mergeProgress.
 * Tombstone — теж запис: свіже «прибрати» перемагає старе «додати», і навпаки.
 * При однакових updatedAt перемагає локальний.
 */
export function mergeLibrary(local: Library, remote: Library): Library {
  const merged: Library = { ...remote };
  for (const [id, sub] of Object.entries(local)) {
    const existing = merged[id];
    if (!existing || sub.updatedAt >= existing.updatedAt) merged[id] = sub;
  }
  return merged;
}

function sameSubscription(a: Subscription, b: Subscription): boolean {
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.addedAt === b.addedAt &&
    a.updatedAt === b.updatedAt &&
    a.removed === b.removed
  );
}

export function sameLibrary(a: Library, b: Library): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const right = b[key];
    return right !== undefined && sameSubscription(a[key]!, right);
  });
}
```

- [ ] **Step 6: Реалізувати `src/library/parseLibrary.ts`**

```ts
import type { Library, Subscription } from '../types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function toSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    (r.kind !== 'catalog' && r.kind !== 'course') ||
    typeof r.title !== 'string' ||
    !isFiniteNumber(r.addedAt) ||
    !isFiniteNumber(r.updatedAt) ||
    typeof r.removed !== 'boolean'
  ) {
    return null;
  }
  // Збираємо заново, а не повертаємо як є: зайві поля з чужого файлу не мусять осідати в IndexedDB.
  return { kind: r.kind, title: r.title, addedAt: r.addedAt, updatedAt: r.updatedAt, removed: r.removed };
}

/**
 * Файл бібліотеки в Drive міг записати інший пристрій зі старішою чи новішою
 * версією застосунку. Зламані записи відкидаємо поштучно, щоб не втратити решту.
 */
export function parseLibrary(content: unknown): Library {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return {};
  const out: Library = {};
  for (const [id, value] of Object.entries(content as Record<string, unknown>)) {
    const sub = toSubscription(value);
    if (sub) out[id] = sub;
  }
  return out;
}
```

- [ ] **Step 7: Запустити тести**

Run: `npx vitest run src/library`
Expected: PASS.

- [ ] **Step 8: Уточнити spec**

У `docs/superpowers/specs/2026-10-13-team-catalogs-design.md`, розділ «Модель даних»:
- у `Subscription` додати поле `title: string` з коментарем «Назва папки на момент додавання — щоб на новому пристрої картка мала підпис ще до скану.»;
- у `CatalogSnapshot` замінити `courseIds: string[]` на `courses: { id: string; title: string }[]` з коментарем «підпапки на момент останнього listFolder — назва потрібна картці «Скануємо…»»;
- у розділі «Наслідки» й «Потоки даних» замінити згадки `courseIds` на `courses`.

- [ ] **Step 9: Перевірити збірку й закомітити**

Run: `npm test && npm run build`
Expected: усі тести PASS, збірка без помилок.

```bash
git add src/types.ts src/library docs/superpowers/specs/2026-10-13-team-catalogs-design.md
git commit -m "feat: типи бібліотеки та злиття підписок із tombstone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: IndexedDB v2 і міграція

**Files:**
- Modify: `src/storage/db.ts`
- Test: `src/storage/db.test.ts`

**Interfaces:**
- Consumes: `Subscription`, `Library`, `CatalogSnapshot`, `CatalogEntry` (Task 1); `mergeLibrary` (Task 1).
- Produces (у `LearnerDb`):
  - `getLibrary(): Promise<Library>`
  - `putSubscription(id: string, sub: Subscription): Promise<void>`
  - `mergeIntoLibrary(library: Library): Promise<Library>`
  - `getCatalogs(): Promise<CatalogSnapshot[]>`
  - `putCatalog(snapshot: CatalogSnapshot): Promise<void>`
  - `deleteCatalog(id: string): Promise<void>`
  - `openLearnerDb(name?: string, options?: { builtinCatalogId?: string }): Promise<LearnerDb>`

- [ ] **Step 1: Додати падаючі тести в кінець `src/storage/db.test.ts`**

Додати до імпортів: `import { openDB } from 'idb';` і `import type { CatalogSnapshot, Subscription } from '../types';`.

```ts
function sub(updatedAt: number, over: Partial<Subscription> = {}): Subscription {
  return { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt, removed: false, ...over };
}

describe('бібліотека', () => {
  it('на новій базі бібліотека порожня', async () => {
    await expect(db.getLibrary()).resolves.toEqual({});
  });

  it('пише й читає підписку за id папки', async () => {
    await db.putSubscription('cat1', sub(5));
    await expect(db.getLibrary()).resolves.toEqual({ cat1: sub(5) });
  });

  it('mergeIntoLibrary лишає свіжіший запис сховища й додає новий', async () => {
    await db.putSubscription('cat1', sub(9, { title: 'Свіже' }));
    const merged = await db.mergeIntoLibrary({ cat1: sub(3, { title: 'Старе' }), cat2: sub(1) });
    expect(merged.cat1?.title).toBe('Свіже');
    expect(Object.keys(await db.getLibrary()).sort()).toEqual(['cat1', 'cat2']);
  });

  it('mergeIntoLibrary нічого не видаляє', async () => {
    await db.putSubscription('cat1', sub(1));
    await db.mergeIntoLibrary({});
    await expect(db.getLibrary()).resolves.toHaveProperty('cat1');
  });
});

describe('знімки каталогів', () => {
  const snap: CatalogSnapshot = {
    id: 'cat1',
    title: 'Команда дизайну',
    courses: [{ id: 'c1', title: 'Типографіка' }],
    lastSyncedAt: 1,
  };

  it('пише, читає й видаляє знімок', async () => {
    await db.putCatalog(snap);
    await expect(db.getCatalogs()).resolves.toEqual([snap]);
    await db.deleteCatalog('cat1');
    await expect(db.getCatalogs()).resolves.toEqual([]);
  });
});

describe('міграція v1 → v2', () => {
  const BUILTIN = 'builtin-catalog-000000000000';

  /** База так, як її лишила версія застосунку до каталогів користувача. */
  async function seedV1(name: string, courses: object[]): Promise<void> {
    const v1 = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('courses', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'fileId' });
        database.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    for (const c of courses) await v1.put('courses', c);
    await v1.put('progress', {
      fileId: 'v1',
      positionSec: 5,
      durationSec: 10,
      completed: false,
      updatedAt: 3,
    });
    v1.close();
  }

  const legacy = (id: string, source?: 'catalog' | 'own') => ({
    ...course(id, `Курс ${id}`),
    addedAt: 42,
    ...(source ? { source } : {}),
  });

  it('власні курси стають підписками, дерево лишається, source зникає', async () => {
    const name = `migrate-own-${counter}`;
    await seedV1(name, [legacy('own1'), legacy('own2', 'own')]);

    const migrated = await openLearnerDb(name, { builtinCatalogId: BUILTIN });

    expect(await migrated.getLibrary()).toEqual({
      own1: { kind: 'course', title: 'Курс own1', addedAt: 42, updatedAt: 42, removed: false },
      own2: { kind: 'course', title: 'Курс own2', addedAt: 42, updatedAt: 42, removed: false },
    });
    const courses = await migrated.getCourses();
    expect(courses).toHaveLength(2);
    expect(courses.every((c) => !('source' in c))).toBe(true);
    expect(courses[0]?.tree.kind).toBe('folder');
  });

  it('курси каталогу йдуть у знімок вбудованого каталогу, а не в підписки', async () => {
    const name = `migrate-catalog-${counter}`;
    await seedV1(name, [legacy('cat1', 'catalog'), legacy('cat2', 'catalog')]);

    const migrated = await openLearnerDb(name, { builtinCatalogId: BUILTIN });

    expect(await migrated.getLibrary()).toEqual({});
    expect(await migrated.getCatalogs()).toEqual([
      {
        id: BUILTIN,
        title: '',
        courses: [
          { id: 'cat1', title: 'Курс cat1' },
          { id: 'cat2', title: 'Курс cat2' },
        ],
        lastSyncedAt: 0,
      },
    ]);
    await expect(migrated.getCourses()).resolves.toHaveLength(2);
  });

  it('без вбудованого каталогу курси каталогу лишаються кешем без посилань', async () => {
    const name = `migrate-no-builtin-${counter}`;
    await seedV1(name, [legacy('cat1', 'catalog'), legacy('own1')]);

    const migrated = await openLearnerDb(name);

    expect(Object.keys(await migrated.getLibrary())).toEqual(['own1']);
    expect(await migrated.getCatalogs()).toEqual([]);
    await expect(migrated.getCourses()).resolves.toHaveLength(2);
  });

  it('прогрес переживає міграцію', async () => {
    const name = `migrate-progress-${counter}`;
    await seedV1(name, [legacy('own1')]);

    const migrated = await openLearnerDb(name, { builtinCatalogId: BUILTIN });

    expect((await migrated.getProgress()).v1?.positionSec).toBe(5);
  });
});
```

- [ ] **Step 2: Переконатися, що нові тести падають**

Run: `npx vitest run src/storage/db.test.ts`
Expected: FAIL — `db.getLibrary is not a function` тощо; старі тести PASS.

- [ ] **Step 3: Переписати `src/storage/db.ts`**

Повний новий вміст файлу (методи курсів, прогресу й meta — ті самі, що були):

```ts
import { openDB } from 'idb';
import { mergeLibrary } from '../library/mergeLibrary';
import { mergeProgress } from './mergeProgress';
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type {
  CatalogEntry,
  CatalogSnapshot,
  Course,
  Library,
  ProgressMap,
  ProgressRecord,
  Subscription,
} from '../types';

export type { Course, ProgressMap, ProgressRecord } from '../types';

const DB_VERSION = 2;

/** У IndexedDB запис прогресу лежить разом із ключем, бо store має keyPath. */
type StoredProgress = ProgressRecord & { fileId: string };
type StoredSubscription = Subscription & { id: string };
/** У v1 курс знав, звідки він: 'catalog' чи власний. Тепер це знає бібліотека. */
type LegacyCourse = Course & { source?: 'catalog' | 'own' };

interface LearnerSchema extends DBSchema {
  courses: { key: string; value: Course };
  progress: { key: string; value: StoredProgress };
  meta: { key: string; value: { key: string; value: unknown } };
  library: { key: string; value: StoredSubscription };
  catalogs: { key: string; value: CatalogSnapshot };
}

type UpgradeTx = IDBPTransaction<LearnerSchema, StoreNames<LearnerSchema>[], 'versionchange'>;

export type LearnerDb = {
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  putCourse(course: Course): Promise<void>;
  deleteCourse(id: string): Promise<void>;
  getProgress(): Promise<ProgressMap>;
  putProgressRecord(fileId: string, record: ProgressRecord): Promise<void>;
  /**
   * Вливає `map` у те, що ЗАРАЗ у сховищі, одною readwrite-транзакцією, і
   * повертає результат. Нічого не видаляє: запис, який зʼявився, поки
   * викликач ходив у мережу, мусить вижити (див. docSync).
   */
  mergeIntoProgress(map: ProgressMap): Promise<ProgressMap>;
  getLibrary(): Promise<Library>;
  putSubscription(id: string, sub: Subscription): Promise<void>;
  /** Як mergeIntoProgress, але для підписок: одна транзакція, нічого не видаляє. */
  mergeIntoLibrary(library: Library): Promise<Library>;
  getCatalogs(): Promise<CatalogSnapshot[]>;
  putCatalog(snapshot: CatalogSnapshot): Promise<void>;
  deleteCatalog(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
};

export type OpenOptions = {
  /** Id вбудованого каталогу: міграція v1 → v2 переносить у його знімок курси з source: 'catalog'. */
  builtinCatalogId?: string;
};

/**
 * v1 → v2: власні курси стають підписками, курси каталогу — знімком вбудованого каталогу.
 * Дерева лишаються на місці — після оновлення нічого не сканується заново.
 * Await тут лише на запитах цієї ж транзакції, тому вона не закривається посеред міграції.
 */
async function migrateV1Courses(tx: UpgradeTx, builtinCatalogId: string | undefined): Promise<void> {
  const courses = tx.objectStore('courses');
  const library = tx.objectStore('library');
  const builtin: CatalogEntry[] = [];

  for (const legacy of (await courses.getAll()) as LegacyCourse[]) {
    const { source, ...course } = legacy;
    if (source === 'catalog') {
      // Без вбудованого каталогу в збірці такий курс лишається кешем без посилань
      // і зникне при першому reconcile. Прогрес його лишається.
      if (builtinCatalogId) builtin.push({ id: course.id, title: course.title });
    } else {
      await library.put({
        id: course.id,
        kind: 'course',
        title: course.title,
        addedAt: course.addedAt,
        updatedAt: course.addedAt,
        removed: false,
      });
    }
    if (source !== undefined) await courses.put(course);
  }

  if (builtinCatalogId && builtin.length > 0) {
    await tx.objectStore('catalogs').put({
      id: builtinCatalogId,
      title: '',
      courses: builtin,
      lastSyncedAt: 0,
    });
  }
}

export async function openLearnerDb(
  name = 'learner',
  options: OpenOptions = {},
): Promise<LearnerDb> {
  const db: IDBPDatabase<LearnerSchema> = await openDB<LearnerSchema>(name, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        database.createObjectStore('courses', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'fileId' });
        database.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        database.createObjectStore('library', { keyPath: 'id' });
        database.createObjectStore('catalogs', { keyPath: 'id' });
        if (oldVersion === 1) void migrateV1Courses(tx, options.builtinCatalogId);
      }
    },
  });

  return {
    getCourses: () => db.getAll('courses'),
    getCourse: (id) => db.get('courses', id),
    putCourse: async (course) => {
      await db.put('courses', course);
    },
    // Видалення курсу свідомо не торкається прогресу: це єдині невідтворювані дані.
    deleteCourse: async (id) => {
      await db.delete('courses', id);
    },

    getProgress: async () => {
      const rows = await db.getAll('progress');
      const map: ProgressMap = {};
      for (const { fileId, ...record } of rows) map[fileId] = record;
      return map;
    },

    putProgressRecord: async (fileId, record) => {
      await db.put('progress', { fileId, ...record });
    },

    mergeIntoProgress: async (map) => {
      const tx = db.transaction('progress', 'readwrite');
      const rows = await tx.store.getAll();
      const current: ProgressMap = {};
      for (const { fileId, ...record } of rows) current[fileId] = record;

      // Поточний вміст сховища йде першим аргументом: при однаковому updatedAt
      // mergeProgress лишає перший, а це саме той бік, куди міг приїхати свіжий
      // локальний запис, поки викликач був у мережі.
      const merged = mergeProgress(current, map);
      for (const [fileId, record] of Object.entries(merged)) {
        await tx.store.put({ fileId, ...record });
      }
      await tx.done;
      return merged;
    },

    getLibrary: async () => {
      const library: Library = {};
      for (const { id, ...sub } of await db.getAll('library')) library[id] = sub;
      return library;
    },

    putSubscription: async (id, sub) => {
      await db.put('library', { id, ...sub });
    },

    mergeIntoLibrary: async (incoming) => {
      const tx = db.transaction('library', 'readwrite');
      const current: Library = {};
      for (const { id, ...sub } of await tx.store.getAll()) current[id] = sub;

      // Сховище першим — з тієї ж причини, що й у mergeIntoProgress.
      const merged = mergeLibrary(current, incoming);
      for (const [id, sub] of Object.entries(merged)) {
        await tx.store.put({ id, ...sub });
      }
      await tx.done;
      return merged;
    },

    getCatalogs: () => db.getAll('catalogs'),
    putCatalog: async (snapshot) => {
      await db.put('catalogs', snapshot);
    },
    deleteCatalog: async (id) => {
      await db.delete('catalogs', id);
    },

    getMeta: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    setMeta: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}
```

- [ ] **Step 4: Запустити тести**

Run: `npx vitest run src/storage`
Expected: PASS (і нові, і наявні тести `db`/`syncEngine`).

- [ ] **Step 5: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/storage/db.ts src/storage/db.test.ts
git commit -m "feat: IndexedDB v2 зі сторами бібліотеки й каталогів і міграцією v1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Загальний `docSync` і синхронізація бібліотеки

**Files:**
- Create: `src/storage/docSync.ts`
- Modify: `src/storage/syncEngine.ts`
- Create: `src/library/librarySync.ts`, `src/library/librarySync.test.ts`
- Create: `src/test/fakeAppData.ts`
- Test (без змін, мусять пройти): `src/storage/syncEngine.test.ts`

**Interfaces:**
- Consumes: `LearnerDb.getLibrary/mergeIntoLibrary/getMeta/setMeta` (Task 2); `parseLibrary`, `mergeLibrary`, `sameLibrary` (Task 1).
- Produces:
  - `type DocSync<T> = { syncNow(): Promise<T>; scheduleSync(): void; flush(): Promise<void> }`
  - `createDocSync<T>(db, api, options: DocSyncOptions<T>): DocSync<T>`
  - `SYNC_DEBOUNCE_MS` (тепер визначено в `docSync.ts`, `syncEngine.ts` реекспортує)
  - `type SyncEngine = DocSync<ProgressMap>` (сумісний з попереднім)
  - `LIBRARY_FILE = 'learner-library.json'`, `createLibrarySync(db, api, options?): DocSync<Library>`
  - `fakeAppData(): FakeAppData` — для тестів стора (Task 6)

- [ ] **Step 1: Створити `src/test/fakeAppData.ts`**

```ts
import { vi } from 'vitest';
import type { DriveApi } from '../drive/api';

type AppDataApi = Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>;

export type FakeAppData = AppDataApi & {
  files: Record<string, { content: unknown; modifiedTime: string }>;
};

/**
 * appDataFolder у пам'яті: кілька файлів за назвою. Один екземпляр, переданий
 * двом сторам, моделює два пристрої на одному акаунті. Вміст копіюється на
 * вході й виході — як через мережу.
 */
export function fakeAppData(): FakeAppData {
  const files: FakeAppData['files'] = {};
  let tick = 0;
  const copy = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

  return {
    files,
    statAppData: vi.fn(async (name: string) => {
      const file = files[name];
      return file ? { id: name, modifiedTime: file.modifiedTime } : null;
    }),
    readAppData: vi.fn(async (name: string) => {
      const file = files[name];
      return file ? { content: copy(file.content), modifiedTime: file.modifiedTime } : null;
    }),
    writeAppData: vi.fn(async (name: string, content: unknown) => {
      tick += 1;
      const modifiedTime = `2026-10-13T00:00:${String(tick).padStart(2, '0')}.000Z`;
      files[name] = { content: copy(content), modifiedTime };
      return { modifiedTime };
    }),
  };
}
```

- [ ] **Step 2: Написати падаючі тести `src/library/librarySync.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_FILE, createLibrarySync } from './librarySync';
import { PROGRESS_FILE, createSyncEngine } from '../storage/syncEngine';
import { openLearnerDb } from '../storage/db';
import { fakeAppData } from '../test/fakeAppData';
import type { LearnerDb } from '../storage/db';
import type { Subscription } from '../types';

function sub(updatedAt: number, over: Partial<Subscription> = {}): Subscription {
  return { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt, removed: false, ...over };
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`library-sync-test-${counter}`);
});

describe('createLibrarySync', () => {
  it('створює learner-library.json із локальними підписками', async () => {
    const drive = fakeAppData();
    await db.putSubscription('cat1', sub(10));

    await createLibrarySync(db, drive).syncNow();

    expect(drive.files[LIBRARY_FILE]?.content).toEqual({ cat1: sub(10) });
  });

  it('вливає підписку з іншого пристрою в локальну базу', async () => {
    const drive = fakeAppData();
    await drive.writeAppData(LIBRARY_FILE, { cat2: sub(20) });

    const merged = await createLibrarySync(db, drive).syncNow();

    expect(merged).toHaveProperty('cat2');
    await expect(db.getLibrary()).resolves.toHaveProperty('cat2');
  });

  it('свіже «прибрати» з іншого пристрою перемагає локальне «додати»', async () => {
    const drive = fakeAppData();
    await db.putSubscription('cat1', sub(10));
    await drive.writeAppData(LIBRARY_FILE, { cat1: sub(20, { removed: true }) });

    await createLibrarySync(db, drive).syncNow();

    expect((await db.getLibrary()).cat1?.removed).toBe(true);
  });

  it('кожна наступна локальна зміна теж доходить до Drive', async () => {
    const drive = fakeAppData();
    const sync = createLibrarySync(db, drive);
    await db.putSubscription('cat1', sub(10));
    await sync.syncNow();

    await db.putSubscription('cat2', sub(11));
    await sync.syncNow();

    const remote = drive.files[LIBRARY_FILE]?.content as Record<string, unknown>;
    expect(Object.keys(remote).sort()).toEqual(['cat1', 'cat2']);
  });

  it('не пише у Drive, коли нічого не змінилося', async () => {
    const drive = fakeAppData();
    const sync = createLibrarySync(db, drive);
    await db.putSubscription('cat1', sub(10));

    await sync.syncNow();
    await sync.syncNow();

    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
  });

  it('веде власний стан синхронізації, окремий від прогресу', async () => {
    const drive = fakeAppData();
    await db.putProgressRecord('v1', { positionSec: 1, durationSec: 10, completed: false, updatedAt: 1 });
    await db.putSubscription('cat1', sub(10));

    await createSyncEngine(db, drive).syncNow();
    await createLibrarySync(db, drive).syncNow();

    expect(await db.getMeta('remoteModifiedTime')).toBe(drive.files[PROGRESS_FILE]?.modifiedTime);
    expect(await db.getMeta('libraryRemoteModifiedTime')).toBe(
      drive.files[LIBRARY_FILE]?.modifiedTime,
    );
    expect(await db.getMeta('pushedLibrary')).toEqual({ cat1: sub(10) });
  });
});
```

- [ ] **Step 3: Переконатися, що тести падають**

Run: `npx vitest run src/library/librarySync.test.ts`
Expected: FAIL — `Failed to resolve import "./librarySync"`.

- [ ] **Step 4: Створити `src/storage/docSync.ts`**

Це перенесена без змін логіка `createSyncEngine`, узагальнена за типом документа:

```ts
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';

export const SYNC_DEBOUNCE_MS = 10_000;

export type DocSync<T> = {
  /** pull → merge → push за потреби. Повертає злитий документ. */
  syncNow(): Promise<T>;
  scheduleSync(): void;
  /** Негайна синхронізація замість відкладеної. Помилки ковтає: локальні дані вже збережено. */
  flush(): Promise<void>;
};

export type DocSyncOptions<T> = {
  /** Назва файлу в appDataFolder. */
  file: string;
  /** Файл у Drive — недовірений: parse відкидає биті записи поштучно. */
  parse(content: unknown): T;
  merge(local: T, remote: T): T;
  same(a: T, b: T): boolean;
  empty(): T;
  readLocal(): Promise<T>;
  /** Злиття з ПОТОЧНИМ вмістом сховища в одній транзакції; повертає результат. */
  mergeIntoLocal(doc: T): Promise<T>;
  /** Ключі в meta: час останнього баченого файлу й знімок останнього пушу. */
  metaKeys: { remoteModified: string; pushed: string };
  debounceMs?: number;
};

/**
 * Синхронізує один JSON-документ між IndexedDB і appDataFolder.
 * Прогрес і бібліотека — два екземпляри з різними файлами й ключами meta.
 */
export function createDocSync<T>(
  db: Pick<LearnerDb, 'getMeta' | 'setMeta'>,
  api: Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>,
  options: DocSyncOptions<T>,
): DocSync<T> {
  const { file, metaKeys } = options;
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<T> | null = null;

  async function run(): Promise<T> {
    // Незалежні читання запускаємо паралельно.
    const [local, stat, lastSeen, pushed] = await Promise.all([
      options.readLocal(),
      api.statAppData(file),
      db.getMeta<string>(metaKeys.remoteModified),
      db.getMeta<T>(metaKeys.pushed),
    ]);

    // Файл не змінився з нашого останнього злиття — тягнути його немає сенсу.
    const remoteChanged = stat !== null && stat.modifiedTime !== lastSeen;

    let remote = options.empty();
    if (remoteChanged) {
      const payload = await api.readAppData(file);
      remote = options.parse(payload?.content);
    }

    // `local` — знімок, зроблений ДО мережевих походів вище. За цей час
    // користувач міг щось змінити, тому остаточне злиття робиться проти
    // поточного вмісту сховища, в одній транзакції з записом: інакше запис,
    // що приїхав у вікно очікування, зник би зі сховища назавжди.
    const merged = await options.mergeIntoLocal(options.merge(local, remote));

    // Пушимо, якщо те, що ми надіслали б, відрізняється від того, що ми надсилали
    // востаннє — а не лише тоді, коли ІНШИЙ пристрій щось змінив: локальний стан
    // теж міг просунутися відтоді.
    const mustPush = stat === null || !options.same(merged, pushed ?? options.empty());
    if (mustPush) {
      const { modifiedTime } = await api.writeAppData(file, merged);
      await db.setMeta(metaKeys.remoteModified, modifiedTime);
      await db.setMeta(metaKeys.pushed, merged);
    } else if (stat !== null) {
      await db.setMeta(metaKeys.remoteModified, stat.modifiedTime);
    }

    return merged;
  }

  function syncNow(): Promise<T> {
    // Один прохід за раз: паралельні злиття могли б перезаписати одне одного.
    if (running) return running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    syncNow,

    scheduleSync() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // Мережа може бути відсутня — це нормальний стан, не помилка застосунку.
        void syncNow().catch(() => {});
      }, debounceMs);
    },

    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        await syncNow();
      } catch {
        // Дані вже в IndexedDB; злиття відбудеться при наступному запуску.
      }
    },
  };
}
```

- [ ] **Step 5: Переписати `src/storage/syncEngine.ts` поверх `createDocSync`**

Лишити без змін `isProgressRecord`, `parseProgress`, `sameProgress` (разом із їхніми коментарями). Прибрати `REMOTE_MODIFIED_KEY`, `PUSHED_PROGRESS_KEY`, `SYNC_DEBOUNCE_MS` і все тіло `createSyncEngine`. Імпорти й експорти на початку файлу:

```ts
import { createDocSync } from './docSync';
import { mergeProgress } from './mergeProgress';
import type { DocSync } from './docSync';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

export { SYNC_DEBOUNCE_MS } from './docSync';
export const PROGRESS_FILE = 'learner-progress.json';

export type SyncEngine = DocSync<ProgressMap>;
```

Нове тіло `createSyncEngine` в кінці файлу:

```ts
export function createSyncEngine(
  db: LearnerDb,
  api: DriveApi,
  options: { debounceMs?: number } = {},
): SyncEngine {
  return createDocSync(db, api, {
    file: PROGRESS_FILE,
    parse: parseProgress,
    merge: mergeProgress,
    same: sameProgress,
    empty: () => ({}),
    readLocal: () => db.getProgress(),
    mergeIntoLocal: (map) => db.mergeIntoProgress(map),
    // Імена з часів, коли синхронізувався лише прогрес: нові спричинили б зайвий повний push.
    metaKeys: { remoteModified: 'remoteModifiedTime', pushed: 'pushedProgress' },
    debounceMs: options.debounceMs,
  });
}
```

- [ ] **Step 6: Створити `src/library/librarySync.ts`**

```ts
import { createDocSync } from '../storage/docSync';
import { mergeLibrary, sameLibrary } from './mergeLibrary';
import { parseLibrary } from './parseLibrary';
import type { DocSync } from '../storage/docSync';
import type { LearnerDb } from '../storage/db';
import type { DriveApi } from '../drive/api';
import type { Library } from '../types';

export const LIBRARY_FILE = 'learner-library.json';

/** Підписки на каталоги й власні курси — окремим файлом, щоб не чіпати формат прогресу. */
export function createLibrarySync(
  db: LearnerDb,
  api: Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>,
  options: { debounceMs?: number } = {},
): DocSync<Library> {
  return createDocSync(db, api, {
    file: LIBRARY_FILE,
    parse: parseLibrary,
    merge: mergeLibrary,
    same: sameLibrary,
    empty: () => ({}),
    readLocal: () => db.getLibrary(),
    mergeIntoLocal: (library) => db.mergeIntoLibrary(library),
    metaKeys: { remoteModified: 'libraryRemoteModifiedTime', pushed: 'pushedLibrary' },
    debounceMs: options.debounceMs,
  });
}
```

- [ ] **Step 7: Запустити тести синхронізації**

Run: `npx vitest run src/storage src/library`
Expected: PASS — зокрема **усі наявні тести `syncEngine.test.ts` без жодної правки**: це доказ, що поведінка прогресу не змінилась. Якщо якийсь падає, виправляти `docSync.ts`, а не тест.

- [ ] **Step 8: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/storage/docSync.ts src/storage/syncEngine.ts src/library/librarySync.ts src/library/librarySync.test.ts src/test/fakeAppData.ts
git commit -m "refactor: загальний docSync; синхронізація бібліотеки через learner-library.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: План reconcile

**Files:**
- Create: `src/library/reconcile.ts`, `src/library/reconcile.test.ts`

**Interfaces:**
- Consumes: `Library`, `CatalogSnapshot`, `CatalogEntry` (Task 1); `DriveFile` (`src/drive/api.ts`); `FOLDER_MIME` (`src/drive/courseScanner.ts`); `naturalCompare` (`src/drive/naturalSort.ts`).
- Produces:
  - `activeCatalogIds(library: Library, builtinCatalogId?: string): string[]` — вбудований першим, далі додані за `addedAt`
  - `ownCourseIds(library: Library): string[]` — активні власні курси за `addedAt`
  - `type ReconcileInput = { library: Library; builtinCatalogId?: string; catalogs: Record<string, CatalogSnapshot>; cachedCourseIds: string[] }`
  - `type ReconcilePlan = { toScan: string[]; toDelete: string[]; staleCatalogs: string[] }`
  - `planReconcile(input: ReconcileInput): ReconcilePlan`
  - `catalogEntries(files: DriveFile[]): CatalogEntry[]` — підпапки-курси, natural sort

- [ ] **Step 1: Написати падаючі тести `src/library/reconcile.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { activeCatalogIds, catalogEntries, ownCourseIds, planReconcile } from './reconcile';
import type { DriveFile } from '../drive/api';
import type { CatalogSnapshot, Library, Subscription } from '../types';

function sub(kind: Subscription['kind'], addedAt = 1, over: Partial<Subscription> = {}): Subscription {
  return { kind, title: 't', addedAt, updatedAt: addedAt, removed: false, ...over };
}

function snap(id: string, courseIds: string[]): CatalogSnapshot {
  return { id, title: id, courses: courseIds.map((c) => ({ id: c, title: c })), lastSyncedAt: 1 };
}

function plan(library: Library, catalogs: CatalogSnapshot[], cached: string[], builtin?: string) {
  return planReconcile({
    library,
    builtinCatalogId: builtin,
    catalogs: Object.fromEntries(catalogs.map((c) => [c.id, c])),
    cachedCourseIds: cached,
  });
}

describe('activeCatalogIds', () => {
  it('вбудований першим, далі додані за addedAt; власні курси не беруться', () => {
    const library = { b: sub('catalog', 2), a: sub('catalog', 1), c: sub('course', 0) };
    expect(activeCatalogIds(library, 'z')).toEqual(['z', 'a', 'b']);
  });

  it('прибрані каталоги не беруться', () => {
    expect(activeCatalogIds({ a: sub('catalog', 1, { removed: true }) })).toEqual([]);
  });

  it('вбудований — рівно один раз, навіть якщо його id є в бібліотеці прибраним', () => {
    expect(activeCatalogIds({ z: sub('catalog', 1, { removed: true }) }, 'z')).toEqual(['z']);
  });
});

describe('ownCourseIds', () => {
  it('активні власні курси за addedAt', () => {
    const library = {
      b: sub('course', 2),
      a: sub('course', 1),
      x: sub('course', 0, { removed: true }),
      k: sub('catalog', 0),
    };
    expect(ownCourseIds(library)).toEqual(['a', 'b']);
  });
});

describe('planReconcile', () => {
  it('курс нового каталогу, якого немає в кеші, іде на скан', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], []).toScan).toEqual(['c1']);
  });

  it('курс у двох каталогах сканується один раз', () => {
    const library = { k1: sub('catalog'), k2: sub('catalog') };
    expect(plan(library, [snap('k1', ['c1']), snap('k2', ['c1'])], []).toScan).toEqual(['c1']);
  });

  it('відомий курс не пересканьовується', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], ['c1']).toScan).toEqual([]);
  });

  it('курс, що зник із каталогу, стирається з кешу', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], ['c1', 'c2']).toDelete).toEqual(['c2']);
  });

  it('власний курс лишається, хоч його немає в жодному каталозі', () => {
    expect(plan({ own: sub('course') }, [], ['own']).toDelete).toEqual([]);
  });

  it('власний курс без дерева в кеші іде на скан', () => {
    expect(plan({ own: sub('course') }, [], []).toScan).toEqual(['own']);
  });

  it('курс і власний, і в прибраному каталозі лишається', () => {
    const library = { k: sub('catalog', 1, { removed: true }), c1: sub('course') };
    const result = plan(library, [snap('k', ['c1'])], ['c1']);
    expect(result.toDelete).toEqual([]);
    expect(result.staleCatalogs).toEqual(['k']);
  });

  it('курси прибраного каталогу стираються разом із його знімком', () => {
    const library = { k: sub('catalog', 1, { removed: true }) };
    const result = plan(library, [snap('k', ['c1'])], ['c1']);
    expect(result.toDelete).toEqual(['c1']);
    expect(result.staleCatalogs).toEqual(['k']);
  });

  it('знімок вбудованого каталогу не застаріває', () => {
    expect(plan({}, [snap('z', ['c1'])], ['c1'], 'z')).toEqual({
      toScan: [],
      toDelete: [],
      staleCatalogs: [],
    });
  });

  it('активний каталог без знімка нічого не сканує й не стирає', () => {
    expect(plan({ k: sub('catalog') }, [], [])).toEqual({
      toScan: [],
      toDelete: [],
      staleCatalogs: [],
    });
  });
});

describe('catalogEntries', () => {
  const file = (id: string, name: string, over: Partial<DriveFile> = {}): DriveFile => ({
    id,
    name,
    mimeType: 'application/vnd.google-apps.folder',
    trashed: false,
    durationSec: null,
    ...over,
  });

  it('лише видимі папки, природним порядком', () => {
    const entries = catalogEntries([
      file('c10', '10 - Пізній'),
      file('c2', '2 - Ранній'),
      file('mp4', 'промо.mp4', { mimeType: 'video/mp4' }),
      file('hidden', '.archive'),
      file('bin', 'Старе', { trashed: true }),
    ]);
    expect(entries).toEqual([
      { id: 'c2', title: '2 - Ранній' },
      { id: 'c10', title: '10 - Пізній' },
    ]);
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `npx vitest run src/library/reconcile.test.ts`
Expected: FAIL — `Failed to resolve import "./reconcile"`.

- [ ] **Step 3: Реалізувати `src/library/reconcile.ts`**

```ts
import { FOLDER_MIME } from '../drive/courseScanner';
import { naturalCompare } from '../drive/naturalSort';
import type { DriveFile } from '../drive/api';
import type { CatalogEntry, CatalogSnapshot, Library } from '../types';

/** Вбудований першим, далі додані за addedAt. Вбудований — рівно раз, хай що лежить у Library. */
export function activeCatalogIds(library: Library, builtinCatalogId?: string): string[] {
  const added = Object.entries(library)
    .filter(([id, sub]) => sub.kind === 'catalog' && !sub.removed && id !== builtinCatalogId)
    .sort(([, a], [, b]) => a.addedAt - b.addedAt)
    .map(([id]) => id);
  return builtinCatalogId ? [builtinCatalogId, ...added] : added;
}

export function ownCourseIds(library: Library): string[] {
  return Object.entries(library)
    .filter(([, sub]) => sub.kind === 'course' && !sub.removed)
    .sort(([, a], [, b]) => a.addedAt - b.addedAt)
    .map(([id]) => id);
}

export type ReconcileInput = {
  library: Library;
  builtinCatalogId?: string;
  catalogs: Record<string, CatalogSnapshot>;
  cachedCourseIds: string[];
};

export type ReconcilePlan = {
  /** Курси, на які щось посилається, але дерева в кеші ще немає. */
  toScan: string[];
  /** Курси в кеші, на які більше ніщо не посилається. Прогрес їхній лишається. */
  toDelete: string[];
  /** Знімки каталогів, що вже не активні. */
  staleCatalogs: string[];
};

/**
 * Порівнює те, що обрав користувач, із тим, що лежить у кеші.
 * Курс потрібен, якщо він власний або є в знімку хоча б одного активного каталогу.
 */
export function planReconcile({
  library,
  builtinCatalogId,
  catalogs,
  cachedCourseIds,
}: ReconcileInput): ReconcilePlan {
  const active = new Set(activeCatalogIds(library, builtinCatalogId));
  const referenced = new Set(ownCourseIds(library));
  for (const id of active) {
    for (const entry of catalogs[id]?.courses ?? []) referenced.add(entry.id);
  }
  const cached = new Set(cachedCourseIds);

  return {
    toScan: [...referenced].filter((id) => !cached.has(id)),
    toDelete: cachedCourseIds.filter((id) => !referenced.has(id)),
    staleCatalogs: Object.keys(catalogs).filter((id) => !active.has(id)),
  };
}

/** Підпапки каталогу, що є курсами: як і сканер, пропускаємо смітник і приховані. */
export function catalogEntries(files: DriveFile[]): CatalogEntry[] {
  return files
    .filter((f) => f.mimeType === FOLDER_MIME && !f.trashed && !f.name.startsWith('.'))
    .map((f) => ({ id: f.id, title: f.name }))
    .sort((a, b) => naturalCompare(a.title, b.title));
}
```

- [ ] **Step 4: Запустити тести**

Run: `npx vitest run src/library/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/library/reconcile.ts src/library/reconcile.test.ts
git commit -m "feat: чистий план reconcile — що сканувати, що стерти з кешу

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Секції бібліотеки для UI

**Files:**
- Create: `src/library/sections.ts`, `src/library/sections.test.ts`

**Interfaces:**
- Consumes: `activeCatalogIds`, `ownCourseIds` (Task 4); `naturalCompare`; `Course`, `Library`, `CatalogSnapshot` (Task 1).
- Produces:
  - `type CatalogStatus = 'syncing' | 'no-access'`
  - `type CourseStatus = 'scanning' | 'no-access' | 'failed'`
  - `type CourseSlot = { kind: 'ready'; course: Course } | { kind: 'pending'; id: string; title: string; status: CourseStatus | null }`
  - `type CatalogSection = { kind: 'catalog'; id: string; title: string; builtin: boolean; status: CatalogStatus | null; busy: boolean; ready: number; slots: CourseSlot[] }`
  - `type OwnSection = { kind: 'own'; slots: CourseSlot[] }`
  - `type Section = CatalogSection | OwnSection`
  - `type SectionsInput = { library: Library; builtinCatalogId?: string; catalogs: Record<string, CatalogSnapshot>; courses: Course[]; catalogStatus: Record<string, CatalogStatus>; courseStatus: Record<string, CourseStatus> }`
  - `buildSections(input: SectionsInput): Section[]`

- [ ] **Step 1: Написати падаючі тести `src/library/sections.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSections } from './sections';
import type { CatalogSection, SectionsInput } from './sections';
import type { CatalogSnapshot, Course, Subscription } from '../types';

function course(id: string, title = id): Course {
  return { id, title, addedAt: 1, lastScannedAt: 1, tree: { id, kind: 'folder', title, children: [] } };
}

function sub(kind: Subscription['kind'], addedAt = 1, over: Partial<Subscription> = {}): Subscription {
  return { kind, title: `Підписка ${addedAt}`, addedAt, updatedAt: addedAt, removed: false, ...over };
}

function snap(id: string, title: string, entries: [string, string][]): CatalogSnapshot {
  return { id, title, courses: entries.map(([cid, t]) => ({ id: cid, title: t })), lastSyncedAt: 1 };
}

function input(over: Partial<SectionsInput> = {}): SectionsInput {
  return {
    library: {},
    builtinCatalogId: undefined,
    catalogs: {},
    courses: [],
    catalogStatus: {},
    courseStatus: {},
    ...over,
  };
}

const catalogAt = (sections: ReturnType<typeof buildSections>, i: number) =>
  sections[i] as CatalogSection;

describe('buildSections', () => {
  it('порожня бібліотека — жодної секції', () => {
    expect(buildSections(input())).toEqual([]);
  });

  it('порядок: вбудований, додані за addedAt, власні', () => {
    const sections = buildSections(
      input({
        builtinCatalogId: 'z',
        library: { b: sub('catalog', 2), a: sub('catalog', 1), own: sub('course', 0) },
        catalogs: { z: snap('z', 'Каталог 2 РІЦ', [['c1', 'Курс']]) },
      }),
    );
    expect(sections.map((s) => (s.kind === 'catalog' ? s.id : 'own'))).toEqual([
      'z',
      'a',
      'b',
      'own',
    ]);
    expect(catalogAt(sections, 0).builtin).toBe(true);
    expect(catalogAt(sections, 1).builtin).toBe(false);
  });

  it('вбудований каталог без курсів і без активності не показується', () => {
    expect(buildSections(input({ builtinCatalogId: 'z' }))).toEqual([]);
  });

  it('вбудований каталог показується, поки його вперше опитують', () => {
    const sections = buildSections(input({ builtinCatalogId: 'z', catalogStatus: { z: 'syncing' } }));
    expect(catalogAt(sections, 0)).toMatchObject({ id: 'z', title: 'Каталог', busy: true });
  });

  it('доданий каталог показується й порожнім — з назвою з підписки', () => {
    const sections = buildSections(
      input({ library: { k: sub('catalog', 1, { title: 'Команда дизайну' }) } }),
    );
    expect(catalogAt(sections, 0)).toMatchObject({ id: 'k', title: 'Команда дизайну', slots: [] });
  });

  it('назва зі знімка має перевагу над назвою з підписки', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog', 1, { title: 'Стара' }) },
        catalogs: { k: snap('k', 'Нова', []) },
      }),
    );
    expect(catalogAt(sections, 0).title).toBe('Нова');
  });

  it('курси каталогу — природним порядком', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c10', '10 - Пізній'], ['c2', '2 - Ранній']]) },
      }),
    );
    const titles = catalogAt(sections, 0).slots.map((s) =>
      s.kind === 'pending' ? s.title : s.course.title,
    );
    expect(titles).toEqual(['2 - Ранній', '10 - Пізній']);
  });

  it('відсканований курс — ready, невідсканований — pending зі статусом', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c1', 'Один'], ['c2', 'Два'], ['c3', 'Три']]) },
        courses: [course('c1', 'Один')],
        courseStatus: { c2: 'scanning' },
      }),
    );
    const section = catalogAt(sections, 0);
    // Natural sort за назвою: «Два», «Один», «Три».
    expect(section.slots).toEqual([
      { kind: 'pending', id: 'c2', title: 'Два', status: 'scanning' },
      { kind: 'ready', course: course('c1', 'Один') },
      { kind: 'pending', id: 'c3', title: 'Три', status: null },
    ]);
    expect(section.ready).toBe(1);
    expect(section.busy).toBe(true);
  });

  it('без сканування й опитування каталог не зайнятий', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c1', 'Один']]) },
        courses: [course('c1')],
      }),
    );
    expect(catalogAt(sections, 0).busy).toBe(false);
  });

  it('статус «немає доступу» до каталогу доходить до секції', () => {
    const sections = buildSections(
      input({ library: { k: sub('catalog') }, catalogStatus: { k: 'no-access' } }),
    );
    expect(catalogAt(sections, 0).status).toBe('no-access');
  });

  it('власні — за addedAt; прибраний не показується; невідсканований має назву з підписки', () => {
    const sections = buildSections(
      input({
        library: {
          b: sub('course', 2, { title: 'Бе' }),
          a: sub('course', 1, { title: 'А' }),
          gone: sub('course', 0, { removed: true }),
        },
        courses: [course('a', 'А')],
      }),
    );
    expect(sections).toEqual([
      {
        kind: 'own',
        slots: [
          { kind: 'ready', course: course('a', 'А') },
          { kind: 'pending', id: 'b', title: 'Бе', status: null },
        ],
      },
    ]);
  });

  it('той самий курс у двох каталогах — в обох секціях', () => {
    const sections = buildSections(
      input({
        library: { k1: sub('catalog', 1), k2: sub('catalog', 2) },
        catalogs: { k1: snap('k1', 'K1', [['c1', 'Спільний']]), k2: snap('k2', 'K2', [['c1', 'Спільний']]) },
        courses: [course('c1', 'Спільний')],
      }),
    );
    expect(sections.map((s) => s.slots.length)).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `npx vitest run src/library/sections.test.ts`
Expected: FAIL — `Failed to resolve import "./sections"`.

- [ ] **Step 3: Реалізувати `src/library/sections.ts`**

```ts
import { naturalCompare } from '../drive/naturalSort';
import { activeCatalogIds, ownCourseIds } from './reconcile';
import type { CatalogSnapshot, Course, Library } from '../types';

export type CatalogStatus = 'syncing' | 'no-access';
export type CourseStatus = 'scanning' | 'no-access' | 'failed';

/** Картка курсу: або відскановане дерево, або поки лише назва зі знімка чи підписки. */
export type CourseSlot =
  | { kind: 'ready'; course: Course }
  | { kind: 'pending'; id: string; title: string; status: CourseStatus | null };

export type CatalogSection = {
  kind: 'catalog';
  id: string;
  title: string;
  /** Вбудований каталог збірки — підписаний «для всіх» і не прибирається. */
  builtin: boolean;
  status: CatalogStatus | null;
  /** Каталог опитується або якийсь його курс сканується — показуємо «Оновлюємо…». */
  busy: boolean;
  /** Скільки курсів уже відскановано — для «Оновлюємо… 2 з 6». */
  ready: number;
  slots: CourseSlot[];
};

export type OwnSection = { kind: 'own'; slots: CourseSlot[] };

export type Section = CatalogSection | OwnSection;

export type SectionsInput = {
  library: Library;
  builtinCatalogId?: string;
  catalogs: Record<string, CatalogSnapshot>;
  courses: Course[];
  catalogStatus: Record<string, CatalogStatus>;
  courseStatus: Record<string, CourseStatus>;
};

/** Секції не зберігаються — виводяться з підписок, знімків і кешу щоразу заново. */
export function buildSections(input: SectionsInput): Section[] {
  const byId = new Map(input.courses.map((c) => [c.id, c]));
  const slot = (id: string, title: string): CourseSlot => {
    const course = byId.get(id);
    return course
      ? { kind: 'ready', course }
      : { kind: 'pending', id, title, status: input.courseStatus[id] ?? null };
  };

  const sections: Section[] = [];

  for (const id of activeCatalogIds(input.library, input.builtinCatalogId)) {
    const builtin = id === input.builtinCatalogId;
    const snapshot = input.catalogs[id];
    const status = input.catalogStatus[id] ?? null;
    const slots = [...(snapshot?.courses ?? [])]
      .sort((a, b) => naturalCompare(a.title, b.title))
      .map((entry) => slot(entry.id, entry.title));

    // Вбудований каталог без курсів і без активності не показуємо — як і до каталогів користувача.
    if (builtin && slots.length === 0 && status === null) continue;

    sections.push({
      kind: 'catalog',
      id,
      // Після міграції назва вбудованого порожня до першого опитування.
      title: snapshot?.title || input.library[id]?.title || 'Каталог',
      builtin,
      status,
      busy:
        status === 'syncing' ||
        slots.some((s) => s.kind === 'pending' && s.status === 'scanning'),
      ready: slots.filter((s) => s.kind === 'ready').length,
      slots,
    });
  }

  const own = ownCourseIds(input.library).map((id) => slot(id, input.library[id]!.title));
  if (own.length > 0) sections.push({ kind: 'own', slots: own });

  return sections;
}
```

- [ ] **Step 4: Запустити тести**

Run: `npx vitest run src/library/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/library/sections.ts src/library/sections.test.ts
git commit -m "feat: секції бібліотеки виводяться з підписок, знімків і кешу

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Стор — бібліотека, черга reconcile, нові дії

**Files:**
- Modify: `src/store/useStore.ts` (повна заміна)
- Modify: `src/store/useStore.test.ts`
- Modify: `src/app/services.ts`, `src/app/services.test.ts`
- Modify: `src/App.tsx` (тимчасовий місток), `src/App.test.tsx` (фейковий `librarySync`)

**Interfaces:**
- Consumes: `LearnerDb` v2 (Task 2); `DocSync`, `createLibrarySync`, `fakeAppData` (Task 3); `activeCatalogIds`, `planReconcile`, `catalogEntries` (Task 4); `CatalogStatus`, `CourseStatus` (Task 5); `mergeLibrary`, `sameLibrary` (Task 1); `scanCourse`, `parseFolderId`, `DriveError`.
- Produces:
  - `StoreDeps = { db; api; sync: SyncEngine; librarySync: DocSync<Library>; builtinCatalogId?: string; now?: () => number }`
  - `CATALOG_REFRESH_MS = 600_000`, `SCAN_CONCURRENCY = 4`
  - `LearnerState` з полями `courses`, `progress`, `library`, `catalogs: Record<string, CatalogSnapshot>`, `catalogStatus: Record<string, CatalogStatus>`, `courseStatus: Record<string, CourseStatus>`, `builtinCatalogId: string | undefined`, `ready` і діями `init()`, `reconcile()`, `whenIdle()`, `syncFromRemote()`, `flushSync()`, `previewCatalog(input): Promise<CatalogPreview>`, `addCatalog(preview): Promise<void>`, `removeCatalog(id): Promise<void>`, `addCourse(input): Promise<Course>`, `removeCourse(id): Promise<void>`, `rescanCourse(id)`, `setPosition(...)`, `setCompleted(...)`. `catalogSyncing` і `syncCatalog` зникають.
  - `Services` (`src/app/services.ts`): поле `catalogFolderId` перейменоване на `builtinCatalogId`, додано `librarySync`.

- [ ] **Step 1: Переписати `src/store/useStore.ts`**

Повний новий вміст:

```ts
import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { DriveError } from '../drive/api';
import { scanCourse } from '../drive/courseScanner';
import { parseFolderId } from '../drive/parseFolderUrl';
import { mergeLibrary, sameLibrary } from '../library/mergeLibrary';
import { activeCatalogIds, catalogEntries, planReconcile } from '../library/reconcile';
import { mergeProgress } from '../storage/mergeProgress';
import type { DriveApi } from '../drive/api';
import type { CatalogStatus, CourseStatus } from '../library/sections';
import type { DocSync } from '../storage/docSync';
import type { LearnerDb } from '../storage/db';
import type { SyncEngine } from '../storage/syncEngine';
import type {
  CatalogPreview,
  CatalogSnapshot,
  Course,
  Library,
  ProgressMap,
  ProgressRecord,
  Subscription,
} from '../types';

/** Фокус вкладки перевіряє каталоги на нові курси не частіше за це. */
export const CATALOG_REFRESH_MS = 10 * 60 * 1000;
/** Новий пристрій може отримати десятки курсів разом — не валимо Drive паралельними сканами. */
export const SCAN_CONCURRENCY = 4;

export type StoreDeps = {
  db: LearnerDb;
  api: DriveApi;
  sync: SyncEngine;
  librarySync: DocSync<Library>;
  /** Каталог збірки (VITE_CATALOG_FOLDER_ID): є в кожного й не прибирається. */
  builtinCatalogId?: string;
  now?: () => number;
};

export type LearnerState = {
  courses: Course[];
  progress: ProgressMap;
  library: Library;
  catalogs: Record<string, CatalogSnapshot>;
  catalogStatus: Record<string, CatalogStatus>;
  courseStatus: Record<string, CourseStatus>;
  builtinCatalogId: string | undefined;
  ready: boolean;
  init(): Promise<void>;
  /** Опитати всі активні каталоги й привести кеш у відповідність до підписок. */
  reconcile(): Promise<void>;
  /** Чекає, поки фонова черга reconcile спорожніє. Потрібне тестам; UI на нього не чекає. */
  whenIdle(): Promise<void>;
  /** Підтягує прогрес і бібліотеку з інших пристроїв — при старті й поверненні у вкладку. */
  syncFromRemote(): Promise<void>;
  /** Форсує відкладені синхронізації — на pagehide, поки вкладка ще жива. */
  flushSync(): Promise<void>;
  /** Крок 1 додавання каталогу: що лежить за посиланням. Нічого не записує. */
  previewCatalog(input: string): Promise<CatalogPreview>;
  /** Крок 2: підписка, знімок із передперегляду, скан курсів у фоні. */
  addCatalog(preview: CatalogPreview): Promise<void>;
  removeCatalog(id: string): Promise<void>;
  addCourse(input: string): Promise<Course>;
  removeCourse(id: string): Promise<void>;
  rescanCourse(id: string): Promise<void>;
  setPosition(fileId: string, positionSec: number, durationSec: number | null): Promise<void>;
  setCompleted(fileId: string, completed: boolean): Promise<void>;
};

function isAccessError(cause: unknown): boolean {
  return cause instanceof DriveError && (cause.status === 404 || cause.status === 403);
}

/** «Drive API 404» користувачеві нічого не каже — перекладаємо на людську мову. */
function rethrowFriendly(cause: unknown): never {
  if (isAccessError(cause)) {
    throw new Error(
      'Папку не знайдено або до неї немає доступу. Перевірте посилання і те, ' +
        'що папкою поділилися з вашим акаунтом.',
    );
  }
  throw cause;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

export function createLearnerStore(
  deps: StoreDeps,
): UseBoundStore<StoreApi<LearnerState>> {
  const { db, api, sync, librarySync, builtinCatalogId } = deps;
  const now = deps.now ?? (() => Date.now());

  return create<LearnerState>((set, get) => {
    /**
     * Пише запис і локально, і в IndexedDB, і планує злиття у Drive.
     * Приймає будівник, а не готовий запис: злиття з попереднім станом відбувається
     * в момент виклику, проти ПОТОЧНОГО get().progress, а не знімка, зробленого до await.
     */
    async function writeRecord(
      fileId: string,
      build: (previous: ProgressRecord | undefined) => ProgressRecord,
    ): Promise<void> {
      const record = build(get().progress[fileId]);
      // Стан оновлюємо ДО await: інакше другий виклик у тому самому тіку прочитав би
      // застарілий знімок і перезаписав би поле першого старим значенням. Плеєр
      // викликає onProgress і onCompleted синхронно поруч, тому це не рідкісна гонка.
      set({ progress: { ...get().progress, [fileId]: record } });
      await db.putProgressRecord(fileId, record);
      sync.scheduleSync();
    }

    function activeSubscription(id: string): Subscription | undefined {
      const sub = get().library[id];
      return sub && !sub.removed ? sub : undefined;
    }

    /**
     * Локальна зміна підписки. Стан оновлюється синхронно, до першого await, —
     * на це покладаються addCourse і addCatalog. updatedAt строго більший за
     * попередній: інакше пристрій, чий годинник відстає, не зміг би прибрати те,
     * що додав пристрій із годинником, що поспішає.
     */
    async function writeSubscription(
      id: string,
      sub: Omit<Subscription, 'updatedAt'>,
    ): Promise<void> {
      const previous = get().library[id];
      const next: Subscription = {
        ...sub,
        updatedAt: Math.max(now(), (previous?.updatedAt ?? 0) + 1),
      };
      set({ library: { ...get().library, [id]: next } });
      await db.putSubscription(id, next);
      // Без дебаунсу: зміна рідкісна, а закрита одразу вкладка не мусить її загубити.
      void librarySync.flush();
    }

    function setCatalogStatus(id: string, status: CatalogStatus | null): void {
      const current = get().catalogStatus;
      set({ catalogStatus: status ? { ...current, [id]: status } : without(current, id) });
    }

    function setCourseStatus(id: string, status: CourseStatus | null): void {
      const current = get().courseStatus;
      set({ courseStatus: status ? { ...current, [id]: status } : without(current, id) });
    }

    async function putCourse(course: Course): Promise<void> {
      await db.putCourse(course);
      set({ courses: [...get().courses.filter((c) => c.id !== course.id), course] });
    }

    async function refreshCatalog(id: string): Promise<void> {
      const before = get().catalogStatus[id] ?? null;
      setCatalogStatus(id, 'syncing');
      try {
        const files = await api.listFolder(id);
        // Назва потрібна лише раз: listFolder її не дає, а getFile — зайвий запит щоразу.
        const title = get().catalogs[id]?.title || (await api.getFile(id)).name;
        const snapshot: CatalogSnapshot = {
          id,
          title,
          courses: catalogEntries(files),
          lastSyncedAt: now(),
        };
        await db.putCatalog(snapshot);
        set({ catalogs: { ...get().catalogs, [id]: snapshot } });
        setCatalogStatus(id, null);
      } catch (cause) {
        // Офлайн — норма: лишаємо збережений знімок і попередній стан без тривоги.
        setCatalogStatus(id, isAccessError(cause) ? 'no-access' : before === 'syncing' ? null : before);
      }
    }

    async function scanOne(id: string): Promise<void> {
      setCourseStatus(id, 'scanning');
      try {
        await putCourse(await scanCourse(api, id, now()));
        setCourseStatus(id, null);
      } catch (cause) {
        setCourseStatus(id, isAccessError(cause) ? 'no-access' : 'failed');
      }
    }

    /** Стирає непотрібне з кешу й сканує бракуюче. Мережі не чіпає, крім сканів. */
    async function applyPlan(): Promise<void> {
      const { library, catalogs, courses } = get();
      const plan = planReconcile({
        library,
        builtinCatalogId,
        catalogs,
        cachedCourseIds: courses.map((c) => c.id),
      });

      const stale = new Set(plan.staleCatalogs);
      const gone = new Set(plan.toDelete);
      // Прогрес стертих курсів лишається: deleteCourse торкається лише кешу дерева.
      await Promise.all([
        ...plan.staleCatalogs.map((id) => db.deleteCatalog(id)),
        ...plan.toDelete.map((id) => db.deleteCourse(id)),
      ]);
      set({
        catalogs: Object.fromEntries(Object.entries(get().catalogs).filter(([id]) => !stale.has(id))),
        courses: get().courses.filter((c) => !gone.has(c.id)),
      });

      const queue = [...plan.toScan];
      const worker = async (): Promise<void> => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) await scanOne(id);
      };
      await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, worker));
    }

    let lastRefreshAt = -Infinity;

    async function runPass(refresh: boolean): Promise<void> {
      if (refresh) {
        // До першого await: syncFromRemote, викликаний одразу після, мусить бачити, що опитування вже йде.
        lastRefreshAt = now();
        await Promise.all(activeCatalogIds(get().library, builtinCatalogId).map(refreshCatalog));
      }
      await applyPlan();
    }

    let running: Promise<void> | null = null;
    let pending: { refresh: boolean } | null = null;

    /**
     * Один прохід за раз. Запит, що прийшов під час проходу, не губиться й не
     * запускає паралельний: виконується одразу після поточного, а кілька таких
     * запитів злипаються в один. Прохід, що впав, не зупиняє черги.
     */
    function schedule(refresh: boolean): Promise<void> {
      pending = { refresh: refresh || (pending?.refresh ?? false) };
      running ??= (async () => {
        try {
          while (pending) {
            const job = pending;
            pending = null;
            await runPass(job.refresh).catch(() => {});
          }
        } finally {
          running = null;
        }
      })();
      return running;
    }

    async function syncProgress(): Promise<void> {
      try {
        const synced = await sync.syncNow();
        // Зливаємо, а не замінюємо: інакше результат синку, що з якоїсь причини не
        // містить локальних записів, тихо знищив би історію перегляду. Поточний
        // стан іде першим — при однаковому updatedAt перемагає цей пристрій.
        set({ progress: mergeProgress(get().progress, synced) });
      } catch {
        // Мережі може не бути — це нормальний стан, не помилка застосунку.
      }
    }

    async function syncLibrary(): Promise<void> {
      let changed = false;
      try {
        const synced = await librarySync.syncNow();
        const before = get().library;
        // Так само зливаємо, а не замінюємо: локальна зміна могла приїхати, поки синк ходив у мережу.
        const merged = mergeLibrary(before, synced);
        changed = !sameLibrary(before, merged);
        set({ library: merged });
      } catch {
        // Офлайн: працюємо з локальною бібліотекою.
      }
      // Каталог, доданий на іншому пристрої, опитуємо одразу; інакше — не частіше за інтервал.
      if (changed || now() - lastRefreshAt >= CATALOG_REFRESH_MS) void schedule(true);
    }

    /** Курс із цим id уже є в активному каталозі — повертає знімок цього каталогу. */
    function catalogHolding(courseId: string): CatalogSnapshot | undefined {
      return activeCatalogIds(get().library, builtinCatalogId)
        .map((id) => get().catalogs[id])
        .find((snapshot) => snapshot?.courses.some((c) => c.id === courseId));
    }

    function assertCanAddCatalog(id: string): void {
      if (id === builtinCatalogId || activeSubscription(id)?.kind === 'catalog') {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }
      if (activeSubscription(id)?.kind === 'course') {
        throw new Error('Ця папка вже додана як курс.');
      }
    }

    return {
      courses: [],
      progress: {},
      library: {},
      catalogs: {},
      catalogStatus: {},
      courseStatus: {},
      builtinCatalogId,
      ready: false,

      async init() {
        const [courses, progress, library, catalogs] = await Promise.all([
          db.getCourses(),
          db.getProgress(),
          db.getLibrary(),
          db.getCatalogs(),
        ]);
        set({
          courses,
          progress,
          library,
          catalogs: Object.fromEntries(catalogs.map((c) => [c.id, c])),
        });

        // Каталоги опитуються у фоні: перше сканування — хвилини запитів, а кеш уже можна показувати.
        void schedule(true);

        // Синхронізація — покращення, а не умова запуску: офлайн застосунок мусить працювати.
        await get().syncFromRemote();

        set({ ready: true });
      },

      reconcile: () => schedule(true),

      whenIdle: () => running ?? Promise.resolve(),

      async syncFromRemote() {
        await Promise.all([syncProgress(), syncLibrary()]);
      },

      async flushSync() {
        // flush сам ковтає помилки: дані вже в IndexedDB.
        await Promise.all([sync.flush(), librarySync.flush()]);
      },

      async previewCatalog(input) {
        const id = parseFolderId(input);
        if (!id) throw new Error('Потрібне посилання на папку Google Drive або її ID');
        assertCanAddCatalog(id);

        const [folder, files] = await Promise.all([api.getFile(id), api.listFolder(id)]).catch(
          rethrowFriendly,
        );
        return { id, title: folder.name, courses: catalogEntries(files) };
      },

      async addCatalog(preview) {
        assertCanAddCatalog(preview.id);
        if (preview.courses.length === 0) throw new Error('У папці немає курсів-підпапок.');

        const snapshot: CatalogSnapshot = { ...preview, lastSyncedAt: now() };
        // Знімок і підписка — в одному синхронному блоці: прохід reconcile, що побачив би
        // знімок без підписки, стер би його як застарілий.
        set({ catalogs: { ...get().catalogs, [preview.id]: snapshot } });
        const write = writeSubscription(preview.id, {
          kind: 'catalog',
          title: preview.title,
          addedAt: now(),
          removed: false,
        });
        await Promise.all([db.putCatalog(snapshot), write]);
        void schedule(false);
      },

      async removeCatalog(id) {
        const sub = activeSubscription(id);
        if (!sub || sub.kind !== 'catalog') return;
        // Курси каталогу зникнуть з кешу в наступному проході; прогрес лишається.
        await writeSubscription(id, { ...sub, removed: true });
        void schedule(false);
      },

      async addCourse(input) {
        const folderId = parseFolderId(input);
        if (!folderId) {
          throw new Error('Потрібне посилання на папку Google Drive або її ID');
        }
        if (folderId === builtinCatalogId || activeSubscription(folderId)?.kind === 'catalog') {
          throw new Error('Ця папка вже додана як каталог.');
        }
        const holder = catalogHolding(folderId);
        if (holder) {
          throw new Error(`Цей курс уже є в каталозі «${holder.title || 'Каталог'}».`);
        }

        const course = await scanCourse(api, folderId, now()).catch(rethrowFriendly);
        const previous = activeSubscription(folderId);

        // Курс і підписка — в одному синхронному блоці: прохід reconcile, що побачив би
        // курс без підписки, стер би його з кешу.
        set({ courses: [...get().courses.filter((c) => c.id !== course.id), course] });
        const write = writeSubscription(folderId, {
          kind: 'course',
          title: course.title,
          addedAt: previous?.addedAt ?? now(),
          removed: false,
        });
        await Promise.all([db.putCourse(course), write]);
        setCourseStatus(folderId, null);
        return course;
      },

      async removeCourse(id) {
        const sub = activeSubscription(id);
        if (!sub || sub.kind !== 'course') return;
        // Прогрес не чіпаємо: це єдині дані, які нізвідки не відновити.
        await writeSubscription(id, { ...sub, removed: true });
        void schedule(false);
      },

      async rescanCourse(id) {
        const existing = get().courses.find((c) => c.id === id);
        // Rescan теж падає, коли права на папку змінилися — і так само мусить
        // казати про це людською мовою: цю помилку показує CoursePage.
        const scanned = await scanCourse(api, id, now()).catch(rethrowFriendly);
        await putCourse({ ...scanned, addedAt: existing?.addedAt ?? scanned.addedAt });
      },

      async setPosition(fileId, positionSec, durationSec) {
        await writeRecord(fileId, (previous) => ({
          positionSec,
          // Тривалість, яку вже знаємо, не затираємо новим null.
          durationSec: durationSec ?? previous?.durationSec ?? null,
          completed: previous?.completed ?? false,
          updatedAt: now(),
        }));
      },

      async setCompleted(fileId, completed) {
        await writeRecord(fileId, (previous) => ({
          positionSec: previous?.positionSec ?? 0,
          durationSec: previous?.durationSec ?? null,
          completed,
          updatedAt: now(),
        }));
      },
    };
  });
}
```

- [ ] **Step 2: Підлаштувати наявні тести стора**

У `src/store/useStore.test.ts`:

1. Додати до імпортів:
   ```ts
   import { CATALOG_REFRESH_MS, SCAN_CONCURRENCY } from './useStore';
   import { createLibrarySync } from '../library/librarySync';
   import { fakeAppData } from '../test/fakeAppData';
   import type { DocSync } from '../storage/docSync';
   import type { StoreDeps } from './useStore';
   import type { Library, Subscription } from '../types';
   ```
2. Під `fakeSync` додати:
   ```ts
   function fakeLibrarySync(merged: Library = {}): DocSync<Library> {
     return {
       syncNow: vi.fn(async () => merged),
       scheduleSync: vi.fn(),
       flush: vi.fn(async () => {}),
     };
   }
   ```
3. У **кожному** виклику `createLearnerStore({ ... })` поза новим блоком додати `librarySync: fakeLibrarySync()`.
4. Тест `removeCourse › прибирає курс, але зберігає прогрес`: між `removeCourse` і першим `expect` додати `await store.getState().whenIdle();` — кеш тепер чиститься фоновим проходом.
5. **Видалити повністю** блок `describe('syncCatalog', ...)` — його замінює блок нижче.
6. Правило для тестів, що кладуть курс у `db` напряму перед `init` (`db.putCourse`): поруч треба покласти й підписку `await db.putSubscription(id, { kind: 'course', title: 'Курс', addedAt: 1, updatedAt: 1, removed: false })`. Інакше фоновий reconcile справедливо стирає курс без посилань.

- [ ] **Step 3: Додати нові тести в кінець `src/store/useStore.test.ts`**

```ts
describe('бібліотека й каталоги', () => {
  const CATALOG_ID = 'catalog-fixture-0000000000000';
  const TEAM_ID = 'team-catalog-fixture-00000000';
  const A_ID = 'catalog-course-a-00000000000';
  const B_ID = 'catalog-course-b-00000000000';
  const T_ID = 'team-course-t-000000000000000';
  const FOLDER = 'application/vnd.google-apps.folder';

  const folder = (id: string, name: string): DriveFile => ({
    id,
    name,
    mimeType: FOLDER,
    trashed: false,
    durationSec: null,
  });
  const video = (id: string): DriveFile => ({
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    trashed: false,
    durationSec: 60,
  });

  type FakeDrive = DriveApi & { listing: Record<string, DriveFile[]> };

  /** Drive з вбудованим каталогом (А, Б), каталогом команди (Т), курсом-фікстурою й appData у пам'яті. */
  function driveWith(extra: Record<string, DriveFile[]> = {}): FakeDrive {
    const listing: Record<string, DriveFile[]> = {
      ...COURSE_LISTING,
      [CATALOG_ID]: [folder(B_ID, 'Курс Б'), folder(A_ID, 'Курс А'), { ...video('stray'), name: 'не курс.mp4' }],
      [TEAM_ID]: [folder(T_ID, 'Типографіка')],
      [A_ID]: [video('vA')],
      [B_ID]: [video('vB')],
      [T_ID]: [video('vT')],
      ...extra,
    };
    const names: Record<string, string> = {
      [ROOT_ID]: ROOT_FILE.name,
      [CATALOG_ID]: 'Каталог 2 РІЦ',
      [TEAM_ID]: 'Команда дизайну',
      [A_ID]: 'Курс А',
      [B_ID]: 'Курс Б',
      [T_ID]: 'Типографіка',
    };
    return {
      ...fakeAppData(),
      listing,
      listFolder: vi.fn(async (id: string) => listing[id] ?? []),
      getFile: vi.fn(async (id: string) => {
        const name = names[id] ?? (listing[id] ? id : undefined);
        if (!name) throw new DriveError(404, 'Drive API 404');
        return folder(id, name);
      }),
    };
  }

  function catalogStore(api: DriveApi = driveWith(), over: Partial<StoreDeps> = {}) {
    return createLearnerStore({
      db,
      api,
      sync: fakeSync(),
      librarySync: fakeLibrarySync(),
      builtinCatalogId: CATALOG_ID,
      ...over,
    });
  }

  async function started(store: ReturnType<typeof catalogStore>) {
    await store.getState().init();
    await store.getState().whenIdle();
    return store.getState();
  }

  const listed = (api: DriveApi, id: string) =>
    vi.mocked(api.listFolder).mock.calls.filter(([arg]) => arg === id).length;

  const own = (addedAt = 1): Subscription => ({
    kind: 'course',
    title: 'Курс',
    addedAt,
    updatedAt: addedAt,
    removed: false,
  });

  describe('reconcile', () => {
    it('опитує вбудований каталог і сканує його курси', async () => {
      const state = await started(catalogStore());

      expect(state.catalogs[CATALOG_ID]?.title).toBe('Каталог 2 РІЦ');
      expect(state.catalogs[CATALOG_ID]?.courses.map((c) => c.title)).toEqual(['Курс А', 'Курс Б']);
      expect(state.courses.map((c) => c.title).sort()).toEqual(['Курс А', 'Курс Б']);
      await expect(db.getCourses()).resolves.toHaveLength(2);
    });

    it('init не чекає на каталоги', async () => {
      const api = driveWith();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const listFolder = api.listFolder;
      api.listFolder = vi.fn(async (id: string) => {
        if (id === CATALOG_ID) await gate;
        return listFolder(id);
      });
      const store = catalogStore(api);

      await store.getState().init();

      expect(store.getState().ready).toBe(true);
      expect(store.getState().catalogStatus[CATALOG_ID]).toBe('syncing');
      release();
      await store.getState().whenIdle();
      expect(store.getState().catalogStatus[CATALOG_ID]).toBeUndefined();
    });

    it('не пересканьовує вже відомий курс', async () => {
      const api = driveWith();
      const store = catalogStore(api);
      await started(store);

      await store.getState().reconcile();

      expect(vi.mocked(api.getFile).mock.calls.filter(([id]) => id === A_ID)).toHaveLength(1);
    });

    it('новий курс у каталозі зʼявляється при наступному опитуванні', async () => {
      const api = driveWith({ 'catalog-course-c-00000000000': [video('vC')] });
      const store = catalogStore(api);
      await started(store);

      api.listing[CATALOG_ID]!.push(folder('catalog-course-c-00000000000', 'Курс В'));
      await store.getState().reconcile();

      expect(store.getState().courses.map((c) => c.id)).toContain('catalog-course-c-00000000000');
    });

    it('курс, що зник із каталогу, стирається з кешу, а прогрес лишається', async () => {
      const api = driveWith();
      const store = catalogStore(api);
      await started(store);
      await store.getState().setPosition('vB', 30, 60);

      api.listing[CATALOG_ID] = [folder(A_ID, 'Курс А')];
      await store.getState().reconcile();

      expect(store.getState().courses.map((c) => c.id)).toEqual([A_ID]);
      await expect(db.getCourse(B_ID)).resolves.toBeUndefined();
      await expect(db.getProgress()).resolves.toHaveProperty('vB');
    });

    it('сканує власний курс, якого ще немає в кеші, і не стирає його', async () => {
      await db.putSubscription(ROOT_ID, own());

      const state = await started(catalogStore());

      expect(state.courses.map((c) => c.id)).toContain(ROOT_ID);
    });

    it('збій доступу до одного курсу не заважає іншим і позначає його', async () => {
      const api = driveWith();
      const getFile = api.getFile;
      api.getFile = vi.fn(async (id: string) => {
        if (id === A_ID) throw new DriveError(403, 'Drive API 403');
        return getFile(id);
      });

      const state = await started(catalogStore(api));

      expect(state.courses.map((c) => c.id)).toEqual([B_ID]);
      expect(state.courseStatus[A_ID]).toBe('no-access');
    });

    it('мережевий збій скану позначається як failed, а не як відсутність доступу', async () => {
      const api = driveWith();
      const getFile = api.getFile;
      api.getFile = vi.fn(async (id: string) => {
        if (id === A_ID) throw new TypeError('Failed to fetch');
        return getFile(id);
      });

      const state = await started(catalogStore(api));

      expect(state.courseStatus[A_ID]).toBe('failed');
    });

    it('офлайн лишає знімок каталогу без тривоги', async () => {
      const api = driveWith();
      const store = catalogStore(api);
      await started(store);

      api.listFolder = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      await store.getState().reconcile();

      expect(store.getState().catalogs[CATALOG_ID]?.courses).toHaveLength(2);
      expect(store.getState().catalogStatus[CATALOG_ID]).toBeUndefined();
      expect(store.getState().courses).toHaveLength(2);
    });

    it('без доступу до каталогу показує це й лишає збережене, а з доступом — знімає позначку', async () => {
      const api = driveWith();
      const store = catalogStore(api);
      await started(store);
      const listFolder = api.listFolder;

      api.listFolder = vi.fn(async () => {
        throw new DriveError(403, 'Drive API 403');
      });
      await store.getState().reconcile();
      expect(store.getState().catalogStatus[CATALOG_ID]).toBe('no-access');
      expect(store.getState().courses).toHaveLength(2);

      api.listFolder = listFolder;
      await store.getState().reconcile();
      expect(store.getState().catalogStatus[CATALOG_ID]).toBeUndefined();
    });

    it('одночасні запити злипаються: поточний прохід і ще один', async () => {
      const api = driveWith();
      const store = catalogStore(api);

      await Promise.all([
        store.getState().reconcile(),
        store.getState().reconcile(),
        store.getState().reconcile(),
      ]);

      expect(listed(api, CATALOG_ID)).toBe(2);
    });

    it(`сканує не більше ${SCAN_CONCURRENCY} курсів одночасно`, async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `bulk-course-${String(i).padStart(2, '0')}-000000000`);
      const api = driveWith({
        [CATALOG_ID]: ids.map((id) => folder(id, id)),
        ...Object.fromEntries(ids.map((id) => [id, [video(`v-${id}`)]])),
      });
      let inFlight = 0;
      let peak = 0;
      api.getFile = vi.fn(async (id: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return folder(id, id);
      });

      const state = await started(catalogStore(api));

      expect(peak).toBe(SCAN_CONCURRENCY);
      expect(state.courses).toHaveLength(10);
    });

    it('фокус опитує каталоги не частіше ніж раз на 10 хвилин', async () => {
      let t = 1_000_000;
      const api = driveWith();
      const store = catalogStore(api, { now: () => t });
      await started(store);
      expect(listed(api, CATALOG_ID)).toBe(1);

      t += CATALOG_REFRESH_MS / 2;
      await store.getState().syncFromRemote();
      await store.getState().whenIdle();
      expect(listed(api, CATALOG_ID)).toBe(1);

      t += CATALOG_REFRESH_MS;
      await store.getState().syncFromRemote();
      await store.getState().whenIdle();
      expect(listed(api, CATALOG_ID)).toBe(2);
    });

    it('бібліотека, що змінилась на іншому пристрої, опитує каталоги одразу', async () => {
      let t = 1_000_000;
      const librarySync = fakeLibrarySync();
      const store = catalogStore(driveWith(), { now: () => t, librarySync });
      await started(store);

      vi.mocked(librarySync.syncNow).mockResolvedValue({
        [TEAM_ID]: { kind: 'catalog', title: 'Команда дизайну', addedAt: t, updatedAt: t, removed: false },
      });
      t += 60_000;
      await store.getState().syncFromRemote();
      await store.getState().whenIdle();

      expect(store.getState().catalogs[TEAM_ID]?.title).toBe('Команда дизайну');
      expect(store.getState().courses.map((c) => c.id)).toContain(T_ID);
    });
  });

  describe('previewCatalog', () => {
    it('показує назву каталогу й курси, нічого не записуючи', async () => {
      const store = catalogStore();
      await started(store);

      const preview = await store
        .getState()
        .previewCatalog(`https://drive.google.com/drive/folders/${TEAM_ID}`);

      expect(preview).toEqual({
        id: TEAM_ID,
        title: 'Команда дизайну',
        courses: [{ id: T_ID, title: 'Типографіка' }],
      });
      await expect(db.getLibrary()).resolves.toEqual({});
      expect((await db.getCatalogs()).map((c) => c.id)).toEqual([CATALOG_ID]);
    });

    it('відмовляє вбудованому каталогу', async () => {
      const store = catalogStore();
      await started(store);
      await expect(store.getState().previewCatalog(CATALOG_ID)).rejects.toThrow(/уже є в бібліотеці/);
    });

    it('відмовляє каталогу, який уже додано', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));

      await expect(store.getState().previewCatalog(TEAM_ID)).rejects.toThrow(/уже є в бібліотеці/);
    });

    it('відмовляє папці, доданій як власний курс', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCourse(ROOT_ID);

      await expect(store.getState().previewCatalog(ROOT_ID)).rejects.toThrow(/як курс/);
    });

    it('перекладає 404 від Drive на зрозумілу підказку', async () => {
      const store = catalogStore();
      await started(store);
      await expect(
        store.getState().previewCatalog('unknown-folder-0000000000000'),
      ).rejects.toThrow(/не знайдено або до неї немає доступу/);
    });

    it('відмовляє посиланню, що не є папкою', async () => {
      const store = catalogStore();
      await started(store);
      await expect(store.getState().previewCatalog('сміття')).rejects.toThrow(/посилання на папку/);
    });
  });

  describe('addCatalog і removeCatalog', () => {
    it('додає підписку, одразу пушить її, показує знімок і сканує курси у фоні', async () => {
      const librarySync = fakeLibrarySync();
      const store = catalogStore(driveWith(), { librarySync });
      await started(store);

      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));

      expect(store.getState().catalogs[TEAM_ID]?.courses).toEqual([{ id: T_ID, title: 'Типографіка' }]);
      expect((await db.getLibrary())[TEAM_ID]).toMatchObject({
        kind: 'catalog',
        title: 'Команда дизайну',
        removed: false,
      });
      expect(librarySync.flush).toHaveBeenCalled();
      await store.getState().whenIdle();
      expect(store.getState().courses.map((c) => c.id)).toContain(T_ID);
    });

    it('відмовляє каталогу без курсів', async () => {
      const store = catalogStore();
      await started(store);
      await expect(
        store.getState().addCatalog({ id: TEAM_ID, title: 'Порожній', courses: [] }),
      ).rejects.toThrow(/немає курсів/);
    });

    it('прибирання ставить tombstone, чистить кеш і лишає прогрес', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));
      await store.getState().whenIdle();
      await store.getState().setPosition('vT', 10, 60);

      await store.getState().removeCatalog(TEAM_ID);
      await store.getState().whenIdle();

      expect((await db.getLibrary())[TEAM_ID]?.removed).toBe(true);
      expect(store.getState().catalogs[TEAM_ID]).toBeUndefined();
      expect(store.getState().courses.map((c) => c.id)).not.toContain(T_ID);
      await expect(db.getProgress()).resolves.toHaveProperty('vT');
    });

    it('курс, доданий і як власний, після прибирання каталогу лишається', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCourse(T_ID);
      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));
      await store.getState().whenIdle();

      await store.getState().removeCatalog(TEAM_ID);
      await store.getState().whenIdle();

      expect(store.getState().courses.map((c) => c.id)).toContain(T_ID);
    });

    it('вбудований каталог не прибирається', async () => {
      const store = catalogStore();
      await started(store);

      await store.getState().removeCatalog(CATALOG_ID);
      await store.getState().whenIdle();

      expect(store.getState().library[CATALOG_ID]).toBeUndefined();
      expect(store.getState().catalogs[CATALOG_ID]).toBeDefined();
    });

    it('прибирання перемагає підписку з годинником, що поспішає', async () => {
      const t = 1_000_000;
      const future = t + 3_600_000;
      await db.putSubscription(TEAM_ID, {
        kind: 'catalog',
        title: 'Команда дизайну',
        addedAt: future,
        updatedAt: future,
        removed: false,
      });
      const store = catalogStore(driveWith(), { now: () => t });
      await started(store);

      await store.getState().removeCatalog(TEAM_ID);

      const stored = (await db.getLibrary())[TEAM_ID];
      expect(stored?.removed).toBe(true);
      expect(stored!.updatedAt).toBeGreaterThan(future);
    });

    it('курс каталогу, прибраного під час скану, не лишається в кеші', async () => {
      const api = driveWith();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const getFile = api.getFile;
      api.getFile = vi.fn(async (id: string) => {
        if (id === T_ID) await gate;
        return getFile(id);
      });
      const store = catalogStore(api);
      await started(store);

      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));
      await store.getState().removeCatalog(TEAM_ID);
      release();
      await store.getState().whenIdle();

      expect(store.getState().courses.map((c) => c.id)).not.toContain(T_ID);
      await expect(db.getCourse(T_ID)).resolves.toBeUndefined();
    });
  });

  describe('власні курси як підписки', () => {
    it('addCourse записує підписку й одразу її пушить', async () => {
      const librarySync = fakeLibrarySync();
      const store = catalogStore(driveWith(), { librarySync });
      await started(store);

      await store.getState().addCourse(ROOT_ID);

      expect((await db.getLibrary())[ROOT_ID]).toMatchObject({
        kind: 'course',
        title: ROOT_FILE.name,
        removed: false,
      });
      expect(librarySync.flush).toHaveBeenCalled();
    });

    it('addCourse відмовляє курсу з каталогу, називаючи каталог', async () => {
      const store = catalogStore();
      await started(store);
      await expect(store.getState().addCourse(A_ID)).rejects.toThrow(/в каталозі «Каталог 2 РІЦ»/);
    });

    it('addCourse відмовляє папці доданого каталогу', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCatalog(await store.getState().previewCatalog(TEAM_ID));

      await expect(store.getState().addCourse(TEAM_ID)).rejects.toThrow(/як каталог/);
    });

    it('removeCourse ставить tombstone, прибирає курс із кешу й лишає прогрес', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCourse(ROOT_ID);
      await store.getState().setPosition('v-funnel', 42, 600);

      await store.getState().removeCourse(ROOT_ID);
      await store.getState().whenIdle();

      expect((await db.getLibrary())[ROOT_ID]?.removed).toBe(true);
      expect(store.getState().courses.map((c) => c.id)).not.toContain(ROOT_ID);
      await expect(db.getProgress()).resolves.toHaveProperty('v-funnel');
    });

    it('removeCourse не чіпає курс, якого немає серед власних', async () => {
      const store = catalogStore();
      await started(store);

      await store.getState().removeCourse(A_ID);
      await store.getState().whenIdle();

      expect(store.getState().library[A_ID]).toBeUndefined();
      expect(store.getState().courses.map((c) => c.id)).toContain(A_ID);
    });

    it('повторне додавання після прибирання знову робить курс власним', async () => {
      const store = catalogStore();
      await started(store);
      await store.getState().addCourse(ROOT_ID);
      await store.getState().removeCourse(ROOT_ID);
      await store.getState().whenIdle();

      await store.getState().addCourse(ROOT_ID);
      await store.getState().whenIdle();

      expect(store.getState().library[ROOT_ID]?.removed).toBe(false);
      expect(store.getState().courses.map((c) => c.id)).toContain(ROOT_ID);
    });
  });

  describe('два пристрої', () => {
    it('каталог, доданий на одному, зʼявляється на іншому, і прибирання теж доходить', async () => {
      const api = driveWith();
      const dbB = await openLearnerDb(`store-test-${counter}-b`);
      const deviceA = createLearnerStore({
        db,
        api,
        sync: fakeSync(),
        librarySync: createLibrarySync(db, api),
      });
      const deviceB = createLearnerStore({
        db: dbB,
        api,
        sync: fakeSync(),
        librarySync: createLibrarySync(dbB, api),
      });
      await deviceA.getState().init();
      await deviceB.getState().init();

      await deviceA.getState().addCatalog(await deviceA.getState().previewCatalog(TEAM_ID));
      await deviceA.getState().flushSync();
      await deviceB.getState().syncFromRemote();
      await deviceB.getState().whenIdle();

      expect(deviceB.getState().library[TEAM_ID]?.removed).toBe(false);
      expect(deviceB.getState().courses.map((c) => c.id)).toContain(T_ID);

      await deviceA.getState().removeCatalog(TEAM_ID);
      await deviceA.getState().flushSync();
      await deviceB.getState().syncFromRemote();
      await deviceB.getState().whenIdle();

      expect(deviceB.getState().library[TEAM_ID]?.removed).toBe(true);
      expect(deviceB.getState().courses.map((c) => c.id)).not.toContain(T_ID);
    });
  });
});
```

- [ ] **Step 4: Запустити тести стора**

Run: `npx vitest run src/store`
Expected: PASS. Якщо падає наявний тест через те, що курс зник після `init`, — застосувати правило з Step 2, пункт 6.

- [ ] **Step 5: Оновити `src/app/services.ts`**

Додати імпорт `import { createLibrarySync } from '../library/librarySync';`. Замінити блок від `const db = await openLearnerDb();` до `return` на:

```ts
  // Порожній рядок — теж «каталогу немає»: так змінна виглядає, коли її не задали в CI.
  const builtinCatalogId =
    (import.meta.env.VITE_CATALOG_FOLDER_ID as string | undefined) || undefined;

  // Id вбудованого каталогу потрібен міграції IndexedDB v1 → v2.
  const db = await openLearnerDb('learner', { builtinCatalogId });
  const api = createDriveApi(getToken);
  const sync = createSyncEngine(db, api);
  const librarySync = createLibrarySync(db, api);

  return { db, api, sync, librarySync, builtinCatalogId, tokenClient, refreshToken };
```

У `src/app/services.test.ts` у двох тестах про `VITE_CATALOG_FOLDER_ID` замінити `catalogFolderId` на `builtinCatalogId` (і в `toMatchObject`, і в `services.catalogFolderId`). Додати тест:

```ts
  it('створює синхронізацію бібліотеки', async () => {
    const services = await createServices();
    expect(services.librarySync.syncNow).toBeTypeOf('function');
  });
```

- [ ] **Step 6: Тимчасовий місток в `src/App.tsx` і фейк у `src/App.test.tsx`**

В `src/App.tsx` замінити `catalogSyncing={state.catalogSyncing}` на:

```tsx
              // Тимчасово, до нової бібліотеки (Задача 8).
              catalogSyncing={Object.values(state.catalogStatus).includes('syncing')}
```

В `src/App.test.tsx` у моку `createServices` поруч із `sync,` додати:

```ts
    librarySync: {
      syncNow: vi.fn(async () => ({})),
      scheduleSync: vi.fn(),
      flush: vi.fn(async () => {}),
    },
```

- [ ] **Step 7: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS. (Тести `LibraryPage.test.tsx` блоку «каталог» ще спираються на `source` — вони проходять, бо компонент поки не змінено; їх переписує Задача 8.)

```bash
git add src/store src/app src/App.tsx src/App.test.tsx
git commit -m "feat: стор керує підписками, каталогами й чергою reconcile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Модальні діалоги додавання

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/ui/Modal.tsx`
- Modify: `src/ui/AddCourseDialog.tsx` (повна заміна), Create: `src/ui/AddCourseDialog.test.tsx`
- Create: `src/ui/AddCatalogDialog.tsx`, `src/ui/AddCatalogDialog.test.tsx`

**Interfaces:**
- Consumes: `CatalogPreview` (Task 1); `primaryButton`, `secondaryButton` (`src/ui/buttons.ts`).
- Produces:
  - `Modal({ title, onClose, children })`
  - `AddCourseDialog({ onSubmit(input: string): Promise<void>; onClose(): void })`
  - `AddCatalogDialog({ onPreview(input: string): Promise<CatalogPreview>; onAdd(preview: CatalogPreview): Promise<void>; onClose(): void })`
  - `coursesLabel(n: number): string` — «1 курс», «2 курси», «5 курсів»

> Тимчасово до Задачі 8 `LibraryPage` рендерить `<AddCourseDialog onSubmit={onAddCourse} />` без `onClose` — це помилка типів. У цій задачі в `LibraryPage.tsx` змінити цей рядок на `<AddCourseDialog onSubmit={onAddCourse} onClose={() => {}} />`, щоб збірка лишалась зеленою; Задача 8 цей рядок прибирає. Тести `LibraryPage.test.tsx` про додавання курсу в цій задачі **видалити** (`додає курс за введеним посиланням`, `показує помилку від onAddCourse…`, `не викликає onAddCourse на порожньому полі`): тепер це тести діалогу.

- [ ] **Step 1: Поліфіл `<dialog>` у `src/test/setup.ts`**

Додати в кінець файлу:

```ts
// jsdom не реалізує showModal/close у <dialog>. Мінімальна заміна: перемикає open
// і, як браузер, шле 'close' лише тоді, коли діалог справді був відкритий.
// Фокус-пастку й Esc тут не моделюємо — це робота браузера.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
```

- [ ] **Step 2: Написати падаючі тести `src/ui/AddCourseDialog.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddCourseDialog } from './AddCourseDialog';

const URL = 'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk';

function renderDialog(over: Partial<Parameters<typeof AddCourseDialog>[0]> = {}) {
  const props = { onSubmit: vi.fn(async () => {}), onClose: vi.fn(), ...over };
  render(<AddCourseDialog {...props} />);
  return props;
}

describe('AddCourseDialog', () => {
  it('відкривається модальним діалогом із полем посилання', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Додати курс' })).toBeInTheDocument();
    expect(screen.getByLabelText(/посилання на папку/i)).toBeInTheDocument();
  });

  it('додає курс і закривається', async () => {
    const props = renderDialog();
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(props.onSubmit).toHaveBeenCalledWith(URL);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('показує помилку й лишається відкритим', async () => {
    const props = renderDialog({
      onSubmit: vi.fn(async () => {
        throw new Error('Цей курс уже є в каталозі «Каталог 2 РІЦ».');
      }),
    });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в каталозі/);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Додати курс' })).toBeEnabled();
  });

  it('не викликає onSubmit на порожньому полі', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('«Скасувати» закриває без додавання', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('поки сканує, кнопка показує «Сканую…» і неактивна', async () => {
    renderDialog({ onSubmit: vi.fn(() => new Promise<void>(() => {})) });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(screen.getByRole('button', { name: 'Сканую…' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Написати падаючі тести `src/ui/AddCatalogDialog.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddCatalogDialog, coursesLabel } from './AddCatalogDialog';
import type { CatalogPreview } from '../types';

const URL = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx';

const preview: CatalogPreview = {
  id: '1AbCdEfGhIjKlMnOpQrStUvWx',
  title: 'Команда дизайну',
  courses: ['Типографіка', 'Figma advanced', 'Дизайн-системи', 'Моушн', 'UX-письмо', 'Іконки', 'Колір'].map(
    (title, i) => ({ id: `course-${i}`, title }),
  ),
};

function renderDialog(over: Partial<Parameters<typeof AddCatalogDialog>[0]> = {}) {
  const props = {
    onPreview: vi.fn(async () => preview),
    onAdd: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...over,
  };
  render(<AddCatalogDialog {...props} />);
  return props;
}

async function toPreview() {
  await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
  await userEvent.click(screen.getByRole('button', { name: 'Далі' }));
}

describe('AddCatalogDialog', () => {
  it('крок 1 питає посилання й веде до передперегляду', async () => {
    const props = renderDialog();
    expect(screen.getByRole('dialog', { name: 'Додати каталог курсів' })).toBeInTheDocument();

    await toPreview();

    expect(props.onPreview).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Команда дизайну')).toBeInTheDocument();
    expect(screen.getByText(/7 курсів/)).toBeInTheDocument();
  });

  it('передперегляд показує перші 5 курсів і скільки ще', async () => {
    renderDialog();
    await toPreview();
    expect(await screen.findByText('Типографіка')).toBeInTheDocument();
    expect(screen.getByText('UX-письмо')).toBeInTheDocument();
    expect(screen.queryByText('Іконки')).toBeNull();
    expect(screen.getByText('…ще 2')).toBeInTheDocument();
  });

  it('«Додати каталог» передає саме передперегляд і закриває діалог', async () => {
    const props = renderDialog();
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Додати каталог' }));
    expect(props.onAdd).toHaveBeenCalledWith(preview);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('«Назад» повертає до поля, зберігаючи введене', async () => {
    renderDialog();
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    expect(screen.getByLabelText(/посилання на папку/i)).toHaveValue(URL);
  });

  it('каталог без курсів не можна додати', async () => {
    renderDialog({ onPreview: vi.fn(async () => ({ ...preview, courses: [] })) });
    await toPreview();
    expect(await screen.findByText(/немає курсів-підпапок/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати каталог' })).toBeDisabled();
  });

  it('помилка передперегляду лишає на першому кроці', async () => {
    renderDialog({
      onPreview: vi.fn(async () => {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }),
    });
    await toPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в бібліотеці/);
    expect(screen.getByLabelText(/посилання на папку/i)).toHaveValue(URL);
  });

  it('помилка додавання показується, діалог лишається відкритим', async () => {
    const props = renderDialog({
      onAdd: vi.fn(async () => {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }),
    });
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Додати каталог' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в бібліотеці/);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('coursesLabel', () => {
  it.each([
    [1, '1 курс'],
    [2, '2 курси'],
    [4, '4 курси'],
    [5, '5 курсів'],
    [11, '11 курсів'],
    [12, '12 курсів'],
    [21, '21 курс'],
    [22, '22 курси'],
    [0, '0 курсів'],
  ])('%i → %s', (n, label) => {
    expect(coursesLabel(n)).toBe(label);
  });
});
```

- [ ] **Step 4: Переконатися, що тести падають**

Run: `npx vitest run src/ui/AddCourseDialog.test.tsx src/ui/AddCatalogDialog.test.tsx`
Expected: FAIL — немає ролі `dialog` / `Failed to resolve import "./AddCatalogDialog"`.

- [ ] **Step 5: Створити `src/ui/Modal.tsx`**

```tsx
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export type ModalProps = {
  title: string;
  onClose(): void;
  children: ReactNode;
};

/**
 * Нативний <dialog> через showModal(): фокус-пастку, Esc і затемнення фону дає браузер.
 * Монтується вже відкритим — батько просто рендерить його або ні.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    // StrictMode запускає ефект двічі на тому самому вузлі: повторний showModal
    // на відкритому діалозі в старших браузерах кидає InvalidStateError.
    // close() у прибиранні не викликаємо: браузер сам закриває діалог, вилучений
    // з документа, а 'close' від прибирання в StrictMode закрив би щойно відкритий.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc: браузер закриває діалог сам і шле 'close' — батько знімає його з рендеру.
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-lg border-2 border-rule bg-surface p-6 text-fg shadow-[6px_6px_0_var(--rule)] backdrop:bg-black/50 sm:p-8"
    >
      <h2 id={titleId} className="mb-4 text-2xl font-extrabold tracking-tight">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
```

- [ ] **Step 6: Переписати `src/ui/AddCourseDialog.tsx`**

```tsx
import { useId, useState } from 'react';
import { Modal } from './Modal';
import { primaryButton, secondaryButton } from './buttons';

export type AddCourseDialogProps = {
  onSubmit(input: string): Promise<void>;
  onClose(): void;
};

export const folderInputClass =
  'min-h-11 w-full border-2 border-rule bg-surface px-3 text-[15px] text-fg placeholder:text-muted';

export function AddCourseDialog({ onSubmit, onClose }: AddCourseDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося додати курс');
      setBusy(false);
      return;
    }
    // Успіх знімає діалог з рендеру — стан після цього вже не оновлюємо.
    onClose();
  }

  return (
    <Modal title="Додати курс" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Папка Google Drive, у якій лежать відео курсу, можна з підпапками-розділами.
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-semibold text-muted">
            Посилання на папку Google Drive
          </label>
          <input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className={folderInputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Скасувати
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Сканую…' : 'Додати курс'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 7: Створити `src/ui/AddCatalogDialog.tsx`**

```tsx
import { useId, useState } from 'react';
import { Modal } from './Modal';
import { folderInputClass } from './AddCourseDialog';
import { primaryButton, secondaryButton } from './buttons';
import type { CatalogPreview } from '../types';

export type AddCatalogDialogProps = {
  onPreview(input: string): Promise<CatalogPreview>;
  onAdd(preview: CatalogPreview): Promise<void>;
  onClose(): void;
};

/** Скільки назв курсів видно в передперегляді — решта як «…ще N». */
const PREVIEW_LIMIT = 5;

/** «1 курс», «2 курси», «5 курсів», «11 курсів», «21 курс». */
export function coursesLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} курс`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} курси`;
  return `${n} курсів`;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Не вдалося додати каталог';

/**
 * Два кроки: посилання → передперегляд → підтвердження. Передперегляд — це і є
 * захист від плутанини: побачивши «01 Вступ, 02 Основи…», людина зрозуміє,
 * що вставила курс, а не каталог.
 */
export function AddCatalogDialog({ onPreview, onAdd, onClose }: AddCatalogDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      setPreview(await onPreview(trimmed));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(current: CatalogPreview) {
    setBusy(true);
    setError(null);
    try {
      await onAdd(current);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
      return;
    }
    onClose();
  }

  const errorLine = error && (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  );

  if (!preview) {
    return (
      <Modal title="Додати каталог курсів" onClose={onClose}>
        <form onSubmit={handlePreview} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Папка Drive, у якій кожна підпапка — окремий курс. Нові курси, які туди викладуть,
            зʼявлятимуться самі.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-semibold text-muted">
              Посилання на папку Google Drive
            </label>
            <input
              id={inputId}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className={folderInputClass}
            />
          </div>
          {errorLine}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Скасувати
            </button>
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Шукаю…' : 'Далі'}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  const shown = preview.courses.slice(0, PREVIEW_LIMIT);
  const rest = preview.courses.length - shown.length;
  const empty = preview.courses.length === 0;

  return (
    <Modal title="Додати каталог курсів" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="truncate text-sm text-muted">{value.trim()}</p>
        <div className="border-t-2 border-rule pt-3">
          <p>
            <span className="font-bold">{preview.title}</span>
            {` · ${coursesLabel(preview.courses.length)}`}
          </p>
          {empty ? (
            <p className="mt-2 text-sm text-danger">У папці немає курсів-підпапок.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
              {shown.map((course) => (
                <li key={course.id}>{course.title}</li>
              ))}
              {rest > 0 && <li className="list-none text-muted">{`…ще ${rest}`}</li>}
            </ul>
          )}
        </div>
        {errorLine}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setError(null);
            }}
            className={secondaryButton}
          >
            Назад
          </button>
          <button
            type="button"
            disabled={busy || empty}
            onClick={() => void handleAdd(preview)}
            className={primaryButton}
          >
            {busy ? 'Додаю…' : 'Додати каталог'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 8: Тимчасова правка `LibraryPage` і її тестів**

У `src/ui/LibraryPage.tsx` замінити `<AddCourseDialog onSubmit={onAddCourse} />` на `<AddCourseDialog onSubmit={onAddCourse} onClose={() => {}} />`. У `src/ui/LibraryPage.test.tsx` видалити три тести, перелічені в примітці до задачі.

- [ ] **Step 9: Запустити тести**

Run: `npx vitest run src/ui`
Expected: PASS.

- [ ] **Step 10: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/test/setup.ts src/ui/Modal.tsx src/ui/AddCourseDialog.tsx src/ui/AddCourseDialog.test.tsx src/ui/AddCatalogDialog.tsx src/ui/AddCatalogDialog.test.tsx src/ui/LibraryPage.tsx src/ui/LibraryPage.test.tsx
git commit -m "feat: модальні діалоги додавання курсу й каталогу з передпереглядом

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Бібліотека з секціями й підключення в `App`

**Files:**
- Modify: `src/ui/LibraryPage.tsx` (повна заміна), `src/ui/LibraryPage.test.tsx` (повна заміна)
- Modify: `src/App.tsx`
- Modify: `src/types.ts` (прибрати `Course.source`)

**Interfaces:**
- Consumes: `buildSections`, `Section`, `CatalogSection`, `CourseSlot`, `CourseStatus` (Task 5); дії стора (Task 6); `AddCourseDialog`, `AddCatalogDialog` (Task 7).
- Produces: `LibraryPage` з пропсами `{ sections: Section[]; progress: ProgressMap; onAddCourse(input): Promise<void>; onPreviewCatalog(input): Promise<CatalogPreview>; onAddCatalog(preview): Promise<void>; onRemoveCourse(id): void; onRemoveCatalog(id): void }`.

- [ ] **Step 1: Переписати тести `src/ui/LibraryPage.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';
import type { CatalogSection, CourseSlot, Section } from '../library/sections';
import type { Course, ProgressMap } from '../types';

function makeCourse(id: string, title: string): Course {
  return {
    id,
    title,
    addedAt: 1,
    lastScannedAt: 1,
    tree: {
      id,
      kind: 'folder',
      title,
      children: [
        { id: `${id}-v1`, kind: 'video', title: 'Один.mp4', durationSec: 100 },
        { id: `${id}-v2`, kind: 'video', title: 'Два.mp4', durationSec: 100 },
      ],
    },
  };
}

const course = makeCourse('c1', 'Product Management');
const ready = (c: Course): CourseSlot => ({ kind: 'ready', course: c });

function catalog(over: Partial<CatalogSection> = {}): CatalogSection {
  return {
    kind: 'catalog',
    id: 'team-catalog',
    title: 'Команда дизайну',
    builtin: false,
    status: null,
    busy: false,
    ready: 1,
    slots: [ready(makeCourse('t1', 'Типографіка'))],
    ...over,
  };
}

const own = (slots: CourseSlot[] = [ready(course)]): Section => ({ kind: 'own', slots });

function renderPage(over: Partial<Parameters<typeof LibraryPage>[0]> = {}) {
  const props = {
    sections: [own()] as Section[],
    progress: {} as ProgressMap,
    onAddCourse: vi.fn(async () => {}),
    onPreviewCatalog: vi.fn(async () => ({ id: 'x', title: 'X', courses: [] })),
    onAddCatalog: vi.fn(async () => {}),
    onRemoveCourse: vi.fn(),
    onRemoveCatalog: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <LibraryPage {...props} />
    </MemoryRouter>,
  );
  return props;
}

const watched = { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 };

describe('LibraryPage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Product Management/ })).toBeInTheDocument();
  });

  it('показує загальний прогрес курсу за часом', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('показує кількість переглянутих уроків', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByText(/1 з 2/)).toBeInTheDocument();
  });

  it('пропонує продовжити курс, який дивилися останнім', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByRole('link', { name: /дивитись далі/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/c1-v2',
    );
  });

  it('на порожній бібліотеці пояснює, що робити', () => {
    renderPage({ sections: [] });
    expect(screen.getByText(/тут поки порожньо/i)).toBeInTheDocument();
  });

  it('на головному екрані немає поля для посилання', () => {
    renderPage();
    expect(screen.queryByLabelText(/посилання на папку/i)).toBeNull();
  });

  it('«+ Курс» відкриває діалог, додає курс і закриває діалог', async () => {
    const props = renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Курс' }));
    const dialog = screen.getByRole('dialog', { name: 'Додати курс' });
    await userEvent.type(within(dialog).getByLabelText(/посилання на папку/i), 'abcdefghijklmnopqrstuvwxyz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Додати курс' }));
    expect(props.onAddCourse).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«+ Каталог» відкриває діалог каталогу', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Каталог' }));
    expect(screen.getByRole('dialog', { name: 'Додати каталог курсів' })).toBeInTheDocument();
  });

  it('кожен каталог — окрема секція з назвою папки, власні — окремо', () => {
    renderPage({
      sections: [
        catalog({ id: 'builtin', title: 'Каталог 2 РІЦ', builtin: true, slots: [ready(makeCourse('b1', 'Основи UX'))] }),
        catalog(),
        own(),
      ],
    });
    const builtin = screen.getByRole('region', { name: 'Каталог 2 РІЦ' });
    const team = screen.getByRole('region', { name: 'Команда дизайну' });
    const mine = screen.getByRole('region', { name: 'Власні курси' });
    expect(within(builtin).getByRole('link', { name: 'Основи UX' })).toBeInTheDocument();
    expect(within(team).getByRole('link', { name: 'Типографіка' })).toBeInTheDocument();
    expect(within(mine).getByRole('link', { name: 'Product Management' })).toBeInTheDocument();
  });

  it('вбудований каталог підписаний «для всіх» і не має меню', () => {
    renderPage({ sections: [catalog({ builtin: true, title: 'Каталог 2 РІЦ' })] });
    const region = screen.getByRole('region', { name: 'Каталог 2 РІЦ' });
    expect(within(region).getByText('для всіх')).toBeInTheDocument();
    expect(within(region).queryByLabelText(/дії з каталогом/i)).toBeNull();
  });

  it('меню доданого каталогу веде в Drive', async () => {
    renderPage({ sections: [catalog()] });
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    expect(screen.getByRole('link', { name: /відкрити в drive/i })).toHaveAttribute(
      'href',
      'https://drive.google.com/drive/folders/team-catalog',
    );
  });

  it('меню прибирає каталог після підтвердження', async () => {
    const props = renderPage({ sections: [catalog()] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати каталог' }));
    expect(props.onRemoveCatalog).toHaveBeenCalledWith('team-catalog');
  });

  it('не прибирає каталог, якщо підтвердження скасували', async () => {
    const props = renderPage({ sections: [catalog()] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати каталог' }));
    expect(props.onRemoveCatalog).not.toHaveBeenCalled();
  });

  it('курси каталогу поштучно не прибираються', () => {
    renderPage({ sections: [catalog()] });
    const region = screen.getByRole('region', { name: 'Команда дизайну' });
    expect(within(region).queryByRole('button', { name: 'Прибрати' })).toBeNull();
  });

  it('власний курс прибирається після підтвердження', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('c1');
  });

  it('не прибирає власний курс, якщо підтвердження скасували', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).not.toHaveBeenCalled();
  });

  it('показує, що каталог оновлюється, з лічильником', () => {
    renderPage({
      sections: [
        catalog({
          busy: true,
          ready: 1,
          slots: [
            ready(makeCourse('t1', 'Типографіка')),
            { kind: 'pending', id: 't2', title: 'Моушн', status: 'scanning' },
          ],
        }),
      ],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Оновлюємо… 1 з 2');
  });

  it('без доступу до каталогу попереджає, але показує збережене', () => {
    renderPage({ sections: [catalog({ status: 'no-access' })] });
    expect(screen.getByText(/немає доступу до каталогу/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Типографіка' })).toBeInTheDocument();
  });

  it.each([
    ['scanning', 'Скануємо…'],
    ['no-access', 'Немає доступу до папки'],
    ['failed', 'Не вдалося завантажити — спробуємо пізніше'],
    [null, 'Ще не завантажено'],
  ] as const)('картка курсу без дерева, статус %s', (status, text) => {
    renderPage({
      sections: [catalog({ slots: [{ kind: 'pending', id: 't2', title: 'Моушн', status }] })],
    });
    expect(screen.getByText('Моушн')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Моушн' })).toBeNull();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('власний курс без доступу можна прибрати', async () => {
    const props = renderPage({
      sections: [own([{ kind: 'pending', id: 'gone', title: 'Старий курс', status: 'no-access' }])],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('gone');
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `npx vitest run src/ui/LibraryPage.test.tsx`
Expected: FAIL — немає кнопки `+ Курс`, пропс `sections` не підтримується.

- [ ] **Step 3: Переписати `src/ui/LibraryPage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AddCatalogDialog } from './AddCatalogDialog';
import { AddCourseDialog } from './AddCourseDialog';
import { ProgressBar } from './ProgressBar';
import { primaryButton, secondaryButton } from './buttons';
import { PlayIcon } from './icons';
import { lessonTitle } from './lessonTitle';
import { aggregate, findResumeVideoId, flattenVideos } from '../progress/aggregate';
import type { CatalogSection, CourseSlot, CourseStatus, Section } from '../library/sections';
import type { CatalogPreview, Course, ProgressMap } from '../types';

export type LibraryPageProps = {
  sections: Section[];
  progress: ProgressMap;
  onAddCourse(input: string): Promise<void>;
  onPreviewCatalog(input: string): Promise<CatalogPreview>;
  onAddCatalog(preview: CatalogPreview): Promise<void>;
  onRemoveCourse(id: string): void;
  onRemoveCatalog(id: string): void;
};

/** Курс, який дивилися останнім, і урок, з якого його продовжити. */
function findContinue(courses: Course[], progress: ProgressMap) {
  let best: { course: Course; updatedAt: number } | null = null;
  for (const course of courses) {
    for (const video of flattenVideos(course.tree)) {
      const updatedAt = progress[video.id]?.updatedAt;
      if (updatedAt !== undefined && (!best || updatedAt > best.updatedAt)) {
        best = { course, updatedAt };
      }
    }
  }
  if (!best) return null;

  const videos = flattenVideos(best.course.tree);
  const videoId = findResumeVideoId(best.course, progress);
  const index = videos.findIndex((v) => v.id === videoId);
  if (index === -1) return null;
  if (aggregate(best.course.tree, progress).completedCount === videos.length) return null;
  return { course: best.course, video: videos[index]!, index, total: videos.length };
}

/** Відскановані курси з усіх секцій, без повторів: курс може бути у двох каталогах. */
function visibleCourses(sections: Section[]): Course[] {
  const byId = new Map<string, Course>();
  for (const section of sections) {
    for (const slot of section.slots) {
      if (slot.kind === 'ready') byId.set(slot.course.id, slot.course);
    }
  }
  return [...byId.values()];
}

export function LibraryPage({
  sections,
  progress,
  onAddCourse,
  onPreviewCatalog,
  onAddCatalog,
  onRemoveCourse,
  onRemoveCatalog,
}: LibraryPageProps) {
  const [dialog, setDialog] = useState<'course' | 'catalog' | null>(null);
  const resume = findContinue(visibleCourses(sections), progress);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Мої курси</h1>
        {/* Курс додають частіше — він основна дія; на телефоні обидві кнопки ділять ширину. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDialog('catalog')}
            className={`flex-1 sm:flex-none ${secondaryButton}`}
          >
            + Каталог
          </button>
          <button
            type="button"
            onClick={() => setDialog('course')}
            className={`flex-1 sm:flex-none ${primaryButton}`}
          >
            + Курс
          </button>
        </div>
      </div>

      {resume && (
        <section className="flex flex-col gap-4 bg-hero p-6 text-on-hero sm:p-10">
          <span className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">
            Продовжити
          </span>
          <span className="text-2xl font-extrabold leading-tight sm:text-3xl">
            {lessonTitle(resume.video.title)}
          </span>
          <span className="text-sm opacity-80">
            {resume.course.title} · урок {resume.index + 1} з {resume.total}
          </span>
          <Link
            to={`/course/${resume.course.id}/lesson/${resume.video.id}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 self-start bg-hero-action px-5 text-[15px] font-bold text-on-hero-action hover:opacity-90"
          >
            <PlayIcon />
            Дивитись далі
          </Link>
        </section>
      )}

      {sections.length === 0 ? (
        <p className="border-2 border-dashed border-line p-8 text-center text-muted">
          Тут поки порожньо. Додайте курс або каталог курсів вашої команди за посиланням на
          папку Google Drive.
        </p>
      ) : (
        sections.map((section) =>
          section.kind === 'catalog' ? (
            <CatalogBlock
              key={section.id}
              section={section}
              progress={progress}
              onRemove={onRemoveCatalog}
            />
          ) : (
            <section key="own" aria-labelledby="own-heading" className="flex flex-col gap-6">
              <h2 id="own-heading" className="text-2xl font-extrabold tracking-tight">
                Власні курси
              </h2>
              <CourseGrid slots={section.slots} progress={progress} onRemove={onRemoveCourse} />
            </section>
          ),
        )
      )}

      {dialog === 'course' && (
        <AddCourseDialog onSubmit={onAddCourse} onClose={() => setDialog(null)} />
      )}
      {dialog === 'catalog' && (
        <AddCatalogDialog
          onPreview={onPreviewCatalog}
          onAdd={onAddCatalog}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}

function CatalogBlock({
  section,
  progress,
  onRemove,
}: {
  section: CatalogSection;
  progress: ProgressMap;
  onRemove(id: string): void;
}) {
  const headingId = `catalog-${section.id}`;
  const total = section.slots.length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-2xl font-extrabold tracking-tight">
          {section.title}
        </h2>
        {section.builtin && <span className="text-sm text-muted">для всіх</span>}
        {section.status === 'no-access' ? (
          <p className="text-sm font-semibold text-danger">
            ⚠ Немає доступу до каталогу — показуємо збережене
          </p>
        ) : (
          section.busy && (
            <p role="status" className="animate-pulse text-sm text-muted">
              {total > 0 ? `Оновлюємо… ${section.ready} з ${total}` : 'Оновлюємо…'}
            </p>
          )
        )}
        {!section.builtin && (
          <details className="relative ml-auto">
            <summary
              aria-label={`Дії з каталогом «${section.title}»`}
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center text-xl hover:bg-soft [&::-webkit-details-marker]:hidden"
            >
              ⋯
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex min-w-56 flex-col border-2 border-rule bg-surface shadow-[4px_4px_0_var(--rule)]">
              <a
                href={`https://drive.google.com/drive/folders/${section.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 px-4 py-3 text-sm hover:bg-soft"
              >
                Відкрити в Drive ↗
              </a>
              <button
                type="button"
                className="min-h-11 px-4 py-3 text-left text-sm text-danger hover:bg-soft"
                onClick={() => {
                  if (
                    window.confirm(
                      `Прибрати каталог «${section.title}» з бібліотеки? Прогрес перегляду збережеться.`,
                    )
                  ) {
                    onRemove(section.id);
                  }
                }}
              >
                Прибрати каталог
              </button>
            </div>
          </details>
        )}
      </div>
      {total > 0 && <CourseGrid slots={section.slots} progress={progress} />}
    </section>
  );
}

/** Без onRemove картки не мають кнопки «Прибрати» — так виглядають курси каталогу. */
function CourseGrid({
  slots,
  progress,
  onRemove,
}: {
  slots: CourseSlot[];
  progress: ProgressMap;
  onRemove?(id: string): void;
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot) =>
        slot.kind === 'ready' ? (
          <CourseCard key={slot.course.id} course={slot.course} progress={progress} onRemove={onRemove} />
        ) : (
          <PendingCard
            key={slot.id}
            id={slot.id}
            title={slot.title}
            status={slot.status}
            onRemove={onRemove}
          />
        ),
      )}
    </ul>
  );
}

function RemoveButton({ id, title, onRemove }: { id: string; title: string; onRemove(id: string): void }) {
  return (
    <button
      type="button"
      className="-mr-2 -mt-2 min-h-11 shrink-0 px-2 text-sm text-muted hover:text-danger"
      onClick={() => {
        if (window.confirm(`Прибрати «${title}» з бібліотеки?`)) onRemove(id);
      }}
    >
      Прибрати
    </button>
  );
}

function CourseCard({
  course,
  progress,
  onRemove,
}: {
  course: Course;
  progress: ProgressMap;
  onRemove?(id: string): void;
}) {
  const stats = aggregate(course.tree, progress);
  return (
    <li className="flex flex-col gap-4 border-t-2 border-rule bg-surface pt-4">
      <div className="flex items-start justify-between gap-4">
        <Link to={`/course/${course.id}`} className="text-xl font-bold leading-snug hover:underline">
          {course.title}
        </Link>
        {onRemove && <RemoveButton id={course.id} title={course.title} onRemove={onRemove} />}
      </div>
      <p className="text-sm text-muted">
        {stats.completedCount} з {stats.videoCount} уроків
      </p>
      <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
    </li>
  );
}

const PENDING_TEXT: Record<CourseStatus | 'none', string> = {
  scanning: 'Скануємо…',
  'no-access': 'Немає доступу до папки',
  failed: 'Не вдалося завантажити — спробуємо пізніше',
  none: 'Ще не завантажено',
};

/** Курс, дерева якого ще немає: відомий лише за назвою. Не клікабельний. */
function PendingCard({
  id,
  title,
  status,
  onRemove,
}: {
  id: string;
  title: string;
  status: CourseStatus | null;
  onRemove?(id: string): void;
}) {
  return (
    <li className="flex flex-col gap-4 border-t-2 border-line pt-4 text-muted">
      <div className="flex items-start justify-between gap-4">
        <span className="text-xl font-bold leading-snug">{title || 'Без назви'}</span>
        {onRemove && <RemoveButton id={id} title={title} onRemove={onRemove} />}
      </div>
      <p
        className={`text-sm ${status === 'no-access' ? 'text-danger' : ''} ${
          status === 'scanning' ? 'animate-pulse' : ''
        }`}
      >
        {PENDING_TEXT[status ?? 'none']}
      </p>
    </li>
  );
}
```

- [ ] **Step 4: Підключити в `src/App.tsx`**

Додати імпорт `import { buildSections } from './library/sections';`. Замінити весь елемент `<LibraryPage ... />` у маршруті `/` на:

```tsx
            <LibraryPage
              sections={buildSections(state)}
              progress={state.progress}
              onAddCourse={async (input) => {
                await state.addCourse(input);
              }}
              onPreviewCatalog={(input) => state.previewCatalog(input)}
              onAddCatalog={(preview) => state.addCatalog(preview)}
              onRemoveCourse={(id) => void state.removeCourse(id)}
              onRemoveCatalog={(id) => void state.removeCatalog(id)}
            />
```

- [ ] **Step 5: Прибрати `Course.source` із `src/types.ts`**

Видалити поле `source?: 'catalog' | 'own';` разом із його JSDoc-коментарем. Тоді перевірити, що згадок не лишилося:

Run: `grep -rn "\.source\|source:\|catalogSyncing\|syncCatalog" src`
Expected: жодного збігу поза `src/storage/db.ts` (там `LegacyCourse` і міграція — це навмисно).

- [ ] **Step 6: Запустити тести**

Run: `npx vitest run src/ui src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Повна перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/ui/LibraryPage.tsx src/ui/LibraryPage.test.tsx src/App.tsx src/types.ts
git commit -m "feat: бібліотека секціями — каталоги, власні курси, діалоги додавання

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Контрольна точка — ручна перевірка в браузері**

Зупинитися й попросити людину перевірити (потрібен `.env` з `VITE_GOOGLE_CLIENT_ID`; `npm run dev`):
1. На головному екрані немає поля посилання; «+ Курс» і «+ Каталог» відкривають діалоги; Esc і «Скасувати» закривають.
2. «+ Каталог» → посилання на папку команди → передперегляд із назвою й курсами → «Додати каталог» → секція з'являється одразу, картки «Скануємо…» наповнюються.
3. Меню «⋯» → «Відкрити в Drive ↗» відкриває папку; «Прибрати каталог» прибирає секцію.
4. Вузьке вікно (~375 px): кнопки в один ряд під заголовком, меню не вилазить за край.
5. Після перезавантаження сторінки секції на місці без пересканування.

---

### Task 9: Документація й перевірка на двох пристроях

**Files:**
- Modify: `docs/memory-bank/courses.md` (повна заміна)
- Modify: `docs/memory-bank/progress-sync.md`
- Modify: `docs/memory-bank/status.md`

- [ ] **Step 1: Переписати `docs/memory-bank/courses.md`**

```markdown
# Курси й каталоги

## Модель: підписки окремо від кешу

- **Підписки** (`Library`, `src/types.ts`) — що обрав користувач: каталоги (`kind: 'catalog'`) і власні курси (`kind: 'course'`), ключ — Drive folderId. Синхронізуються між пристроями через `learner-library.json` (див. `progress-sync.md`). Прибирання — tombstone `removed: true`, а не видалення: інакше «прибрати» не дійшло б до інших пристроїв.
- **Кеш** — знімки каталогів (`CatalogSnapshot`: назва й підпапки) і дерева курсів (`Course`) в IndexedDB. Завжди перебудовується з Drive, тому стирається без жалю. Прогрес — ні, ніколи.
- **Вбудований каталог** — `VITE_CATALOG_FOLDER_ID` (збірка; у CI — variable репозиторію). Неявна підписка, якої немає в `Library`; прибрати не можна. Не задано — немає.
- Секції бібліотеки не зберігаються, а виводяться `buildSections` (`src/library/sections.ts`). Курс у двох каталогах показується в обох; прогрес у нього один.

## Reconcile — `src/store/useStore.ts`

- Чиста `planReconcile` (`src/library/reconcile.ts`) каже, що сканувати (на що посилаються підписки чи знімки, але дерева немає) і що стерти (на що не посилається ніщо).
- Прохід: за потреби опитати активні каталоги (`listFolder` кожного → знімок), далі застосувати план. Не більше 4 сканів одночасно.
- **Коли опитуються каталоги:** на старті й при поверненні у вкладку — не частіше ніж раз на 10 хв; одразу, якщо синхронізація принесла зміну бібліотеки. Уже відомі курси не пересканьовуються — нові уроки в них підтягує rescan на сторінці курсу.
- **Черга з одного проходу:** запит під час проходу виконується після нього, кілька таких злипаються. Тести чекають черги через `whenIdle()`.
- Додавання й прибирання оновлюють підписку й кеш **в одному синхронному блоці** — прохід, що побачив би курс без підписки, стер би його.
- `updatedAt` локальної зміни — `max(now, попередній + 1)`: інакше пристрій з годинником, що відстає, не прибрав би доданого «з майбутнього».
- Помилки: 403/404 → «немає доступу» (до каталогу — знімок лишається; до курсу — картка з позначкою). Мережевий збій — без тривоги, повтор при наступному проході.

## Додавання

- **Курс** — одним кроком: `parseFolderId` → `scanCourse` → кеш + підписка. Відмова, якщо папка вже є каталогом або курс уже в активному каталозі (з назвою каталогу).
- **Каталог** — двома: `previewCatalog` (один `getFile` + `listFolder`, нічого не пише) → `addCatalog` (підписка, знімок із передперегляду, скан у фоні). Каталог без підпапок не додається.
- **Автовиявлення «курс чи каталог» навмисно немає:** курс із секціями теж містить лише підпапки. Від плутанини захищає передперегляд.
- `parseFolderId` вимагає ID від 20 символів — фікстури тестів мусять мати реалістичні ID.

## Сканер — `src/drive/courseScanner.ts`

- Рекурсивний, без припущення про глибину; `MAX_DEPTH` обриває цикли через ярлики Drive.
- Уроки — лише `video/*`. Відкидаються `.DS_Store`, файли з крапкою на початку, `trashed`. Ті самі правила для підпапок каталогу (`catalogEntries`).
- Папка без відео **в усьому піддереві** зникає цілком.
- **Порядок масиву `children` і є порядком курсу** — natural sort (`Intl.Collator`, `numeric: true`, без `sensitivity`: `'base'` робила назви, що відрізняються регістром, «рівними»).

## Drive API — `src/drive/api.ts`

- Обидва параметри Shared Drives — на кожному виклику до папок і файлів, на кожній сторінці. Без них спільна папка повертає **порожній список, а не помилку**.
- `durationMillis` → секунди саме тут і більше ніде.
- Backoff з jitter на `429`/`5xx` і на `403` *лише* з причинами rate limit.

## Міграція IndexedDB v1 → v2 — `src/storage/db.ts`

Власні курси стали підписками (`updatedAt = addedAt`), курси з `source: 'catalog'` — знімком вбудованого каталогу; поле `source` прибране. Дерева на місці — оновлення нічого не пересканьовує. Без вбудованого каталогу в збірці його колишні курси зникають при першому reconcile; прогрес лишається.
```

- [ ] **Step 2: Оновити `docs/memory-bank/progress-sync.md`**

- У розділі «Потік запису», пункт 2: замінити «`syncEngine` (`src/storage/syncEngine.ts`)» на «`syncEngine` (`src/storage/syncEngine.ts`, поверх загального `createDocSync` з `src/storage/docSync.ts`)».
- Додати перед «## Межі» розділ:

```markdown
## Два документи — `createDocSync`

Уся логіка pull/merge/push живе в `src/storage/docSync.ts` і обслуговує два файли в `appDataFolder`:
`learner-progress.json` (прогрес) і `learner-library.json` (підписки на каталоги й власні курси, `src/library/librarySync.ts`).
Кожен має власні ключі `meta`: прогрес — історичні `remoteModifiedTime`/`pushedProgress`, бібліотека — `libraryRemoteModifiedTime`/`pushedLibrary`.
Формат файлу прогресу не змінювався: старий клієнт на іншому пристрої просто не бачить бібліотеки.
Зміна підписки пушиться одразу (`flush`), а не з дебаунсом.
```

- У розділі «Межі» замінити рядок «**Курси не синхронізуються** — лише прогрес. Див. `status.md`.» на «Синхронізуються прогрес і підписки; дерева курсів — ні, кожен пристрій сканує їх сам (див. `courses.md`).»

- [ ] **Step 3: Оновити `docs/memory-bank/status.md`**

- `Оновлено:` — поставити дату виконання.
- У «Що є» додати абзац: «Командні каталоги (спека `2026-10-13-team-catalogs-design.md`, план `2026-10-17-team-catalogs.md`): каталоги за посиланням, секція на кожен, бібліотека синхронізується між пристроями через `learner-library.json`.»
- У «Відомі прогалини продукту» видалити пункт «**Власні курси не синхронізуються між пристроями.** …».
- Пункт «**Курси каталогу не оновлюються самі:** …» замінити на: «**Нові уроки в уже відомих курсах не підтягуються самі** — лише rescan на сторінці курсу. Нові *курси* в каталогах з'являються самі (старт і фокус вкладки, не частіше ніж раз на 10 хв).»
- У «Неперевірене» додати пункт: «**Синхронізація бібліотеки між пристроями** підтверджена тестами з двома сторами на спільному fake appData; на двох справжніх профілях — див. результат ручної перевірки нижче.»

- [ ] **Step 4: Перевірка й коміт**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add docs/memory-bank
git commit -m "docs: memory bank про каталоги, підписки й синхронізацію бібліотеки

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Контрольна точка — два пристрої**

Попросити людину: два браузерні профілі (або звичайне й інкогніто вікно) на одному Google-акаунті, обидва на одній збірці.
1. У профілі A додати каталог і власний курс.
2. У профілі B перемкнутися на вкладку (фокус) або перезавантажити — обидва з'являються, курси скануються.
3. У A прибрати каталог; у B після фокусу секція зникає.
4. Прогрес, зроблений у B у курсі прибраного каталогу, повертається, якщо каталог додати знову.

Результат записати в `docs/memory-bank/status.md` (пункт «Неперевірене» → перенести в «Що є» або описати знайдене) і закомітити.
