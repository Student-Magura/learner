import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openLearnerDb } from './db';
import type { Course, LearnerDb, ProgressRecord } from './db';
import type { CatalogSnapshot, Subscription } from '../types';

function course(id: string, title: string): Course {
  return {
    id,
    title,
    addedAt: 1,
    tree: { id, kind: 'folder', title, children: [] },
    lastScannedAt: 1,
  };
}

function rec(over: Partial<ProgressRecord> = {}): ProgressRecord {
  return { positionSec: 10, durationSec: 100, completed: false, updatedAt: 5, ...over };
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`learner-test-${counter}`);
});

describe('курси', () => {
  it('на новій базі список курсів порожній', async () => {
    await expect(db.getCourses()).resolves.toEqual([]);
  });

  it('зберігає й читає курс', async () => {
    await db.putCourse(course('c1', 'Курс 1'));
    await expect(db.getCourse('c1')).resolves.toMatchObject({ title: 'Курс 1' });
  });

  it('перезапис курсу з тим самим id не створює дубль', async () => {
    await db.putCourse(course('c1', 'Старий'));
    await db.putCourse(course('c1', 'Новий'));
    const all = await db.getCourses();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe('Новий');
  });

  it('видаляє курс', async () => {
    await db.putCourse(course('c1', 'Курс'));
    await db.deleteCourse('c1');
    await expect(db.getCourses()).resolves.toEqual([]);
  });
});

describe('прогрес', () => {
  it('на новій базі прогрес порожній', async () => {
    await expect(db.getProgress()).resolves.toEqual({});
  });

  it('пише й читає окремий запис за fileId', async () => {
    await db.putProgressRecord('v1', rec({ positionSec: 42 }));
    const progress = await db.getProgress();
    expect(progress.v1?.positionSec).toBe(42);
  });

  it('mergeIntoProgress доливає записи, не видаляючи наявні', async () => {
    await db.putProgressRecord('old', rec());
    const merged = await db.mergeIntoProgress({ fresh: rec({ positionSec: 7 }) });
    const progress = await db.getProgress();
    expect(Object.keys(progress).sort()).toEqual(['fresh', 'old']);
    expect(Object.keys(merged).sort()).toEqual(['fresh', 'old']);
  });

  it('mergeIntoProgress віддає свіжішому updatedAt перемогу', async () => {
    await db.putProgressRecord('v1', rec({ positionSec: 10, updatedAt: 100 }));
    await db.mergeIntoProgress({ v1: rec({ positionSec: 90, updatedAt: 500 }) });
    await expect(db.getProgress()).resolves.toMatchObject({ v1: { positionSec: 90 } });
  });

  it('mergeIntoProgress не затирає запис з тим самим updatedAt, що вже у сховищі', async () => {
    await db.putProgressRecord('v1', rec({ positionSec: 90, completed: true, updatedAt: 100 }));
    await db.mergeIntoProgress({ v1: rec({ positionSec: 10, completed: false, updatedAt: 100 }) });
    await expect(db.getProgress()).resolves.toMatchObject({ v1: { completed: true } });
  });

  it('запис, зроблений паралельно зі злиттям, не зникає', async () => {
    // Саме той випадок, що губив відмітку «переглянуто»: злиття вже стартувало
    // (і не бачить нового запису у своєму вхідному map), а користувач тим часом
    // тисне чекбокс. Транзакція злиття не має права його знести.
    await db.putProgressRecord('v1', rec({ updatedAt: 100 }));

    const merging = db.mergeIntoProgress({ v1: rec({ positionSec: 20, updatedAt: 200 }) });
    const concurrent = db.putProgressRecord(
      'v2',
      rec({ positionSec: 99, completed: true, updatedAt: 300 }),
    );
    await Promise.all([merging, concurrent]);

    const progress = await db.getProgress();
    expect(progress.v2).toMatchObject({ positionSec: 99, completed: true });
    expect(progress.v1).toMatchObject({ positionSec: 20 });
  });

  it('видалення курсу не чіпає прогрес — записи не втрачаються', async () => {
    await db.putCourse(course('c1', 'Курс'));
    await db.putProgressRecord('v1', rec());
    await db.deleteCourse('c1');
    await expect(db.getProgress()).resolves.toHaveProperty('v1');
  });
});

describe('meta', () => {
  it('невідомий ключ дає undefined', async () => {
    await expect(db.getMeta('nope')).resolves.toBeUndefined();
  });

  it('зберігає й читає значення', async () => {
    await db.setMeta('remoteModifiedTime', '2026-09-20T10:00:00.000Z');
    await expect(db.getMeta<string>('remoteModifiedTime')).resolves.toBe(
      '2026-09-20T10:00:00.000Z',
    );
  });
});

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
