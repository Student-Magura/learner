import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openLearnerDb } from './db';
import type { Course, LearnerDb, ProgressRecord } from './db';

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

  it('replaceProgress повністю замінює вміст', async () => {
    await db.putProgressRecord('old', rec());
    await db.replaceProgress({ fresh: rec({ positionSec: 7 }) });
    const progress = await db.getProgress();
    expect(Object.keys(progress)).toEqual(['fresh']);
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
