import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLearnerStore } from './useStore';
import { openLearnerDb } from '../storage/db';
import { DriveError } from '../drive/api';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { LearnerDb } from '../storage/db';
import type { DriveApi } from '../drive/api';
import type { SyncEngine } from '../storage/syncEngine';
import type { ProgressMap } from '../types';

function fakeApi(): DriveApi {
  return {
    listFolder: vi.fn(async (id: string) => COURSE_LISTING[id] ?? []),
    getFile: vi.fn(async () => ROOT_FILE),
    statAppData: vi.fn(async () => null),
    readAppData: vi.fn(async () => null),
    writeAppData: vi.fn(async () => ({ modifiedTime: '' })),
  };
}

function fakeSync(merged: ProgressMap = {}): SyncEngine {
  return {
    syncNow: vi.fn(async () => merged),
    scheduleSync: vi.fn(),
    flush: vi.fn(async () => {}),
  };
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`store-test-${counter}`);
});

describe('init', () => {
  it('піднімає курси й прогрес зі сховища', async () => {
    await db.putProgressRecord('v1', {
      positionSec: 5,
      durationSec: 100,
      completed: false,
      updatedAt: 1,
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().progress.v1?.positionSec).toBe(5);
  });

  it('вливає результат синхронізації в стан', async () => {
    const sync = fakeSync({
      remote: { positionSec: 50, durationSec: 100, completed: false, updatedAt: 9 },
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync });

    await store.getState().init();

    expect(store.getState().progress.remote?.positionSec).toBe(50);
  });

  it('готовий до роботи навіть коли синхронізація впала', async () => {
    const sync = fakeSync();
    sync.syncNow = vi.fn(async () => {
      throw new Error('офлайн');
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
  });
});

describe('syncFromRemote і flushSync', () => {
  it('вливає прогрес з іншого пристрою в стан, не чекаючи перезавантаження', async () => {
    // Без цього довгоживуча вкладка ніколи не бачила чужого прогресу.
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('mine', 10, 100);

    sync.syncNow = vi.fn(async () => ({
      theirs: { positionSec: 70, durationSec: 100, completed: true, updatedAt: 900 },
    }));
    await store.getState().syncFromRemote();

    expect(store.getState().progress.theirs?.completed).toBe(true);
    // Свій прогрес нікуди не подівся.
    expect(store.getState().progress.mine?.positionSec).toBe(10);
  });

  it('свіжіший локальний запис не затирається результатом синхронізації', async () => {
    let clock = 100;
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, now: () => clock });
    await store.getState().init();

    clock = 900;
    await store.getState().setCompleted('v1', true);

    sync.syncNow = vi.fn(async () => ({
      v1: { positionSec: 1, durationSec: 100, completed: false, updatedAt: 200 },
    }));
    await store.getState().syncFromRemote();

    expect(store.getState().progress.v1?.completed).toBe(true);
  });

  it('відмова синхронізації не валить стан', async () => {
    const sync = fakeSync();
    sync.syncNow = vi.fn(async () => {
      throw new Error('офлайн');
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync, now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 100);

    await expect(store.getState().syncFromRemote()).resolves.toBeUndefined();
    expect(store.getState().progress.v1?.positionSec).toBe(10);
  });

  it('flushSync форсує відкладену синхронізацію', async () => {
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync });
    await store.getState().init();

    await store.getState().flushSync();

    expect(sync.flush).toHaveBeenCalledTimes(1);
  });
});

describe('addCourse', () => {
  it('додає курс за посиланням на папку', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await store.getState().addCourse(`https://drive.google.com/drive/folders/${ROOT_ID}`);

    expect(store.getState().courses).toHaveLength(1);
    expect(store.getState().courses[0]?.title).toBe('Product Management Course');
    await expect(db.getCourses()).resolves.toHaveLength(1);
  });

  it('відмовляється від посилання, що не є папкою, зі зрозумілим текстом', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse('https://example.com/щось')).rejects.toThrow(
      /посилання на папку/i,
    );
    expect(store.getState().courses).toHaveLength(0);
  });

  it('перетворює 404 від Drive у зрозумілу підказку про доступ', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new DriveError(404, 'Drive API 404 Not Found');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/не знайдено|доступ/i);
  });

  it('перетворює 403 від Drive у підказку про права доступу', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new DriveError(403, 'Drive API 403 Forbidden');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/доступ/i);
  });

  it('повторне додавання того самого курсу не створює дубль', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await store.getState().addCourse(ROOT_ID);
    await store.getState().addCourse(ROOT_ID);

    expect(store.getState().courses).toHaveLength(1);
  });
});

describe('rescanCourse', () => {
  it('перетворює 403 від Drive у зрозумілу підказку, а не ковтає помилку', async () => {
    const api = fakeApi();
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);

    api.getFile = vi.fn(async () => {
      throw new DriveError(403, 'Drive API 403 Forbidden');
    });

    await expect(store.getState().rescanCourse(ROOT_ID)).rejects.toThrow(/доступ/i);
  });
});

describe('removeCourse', () => {
  it('прибирає курс, але зберігає прогрес', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);
    await store.getState().setPosition('v-funnel', 42, 600);

    await store.getState().removeCourse(ROOT_ID);

    expect(store.getState().courses).toHaveLength(0);
    await expect(db.getProgress()).resolves.toHaveProperty('v-funnel');
  });
});

describe('setPosition', () => {
  it('записує позицію й тривалість і планує синхронізацію', async () => {
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, now: () => 1000 });
    await store.getState().init();

    await store.getState().setPosition('v1', 42, 600);

    expect(store.getState().progress.v1).toEqual({
      positionSec: 42,
      durationSec: 600,
      completed: false,
      updatedAt: 1000,
    });
    expect(sync.scheduleSync).toHaveBeenCalled();
  });

  it('не скидає позначку «переглянуто» при перезаписі позиції', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setCompleted('v1', true);

    await store.getState().setPosition('v1', 10, 600);

    expect(store.getState().progress.v1?.completed).toBe(true);
  });

  it('зберігає вже відому тривалість, коли плеєр передав null', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    await store.getState().setPosition('v1', 20, null);

    expect(store.getState().progress.v1?.durationSec).toBe(600);
  });
});

describe('setCompleted', () => {
  it('ручна відмітка перебиває автоматичну й в обидва боки', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 5 });
    await store.getState().init();

    await store.getState().setCompleted('v1', true);
    expect(store.getState().progress.v1?.completed).toBe(true);

    await store.getState().setCompleted('v1', false);
    expect(store.getState().progress.v1?.completed).toBe(false);
  });

  it('оновлює updatedAt, щоб відмітка перемогла при злитті', async () => {
    let clock = 100;
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => clock });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    clock = 900;
    await store.getState().setCompleted('v1', true);

    expect(store.getState().progress.v1?.updatedAt).toBe(900);
  });

  it('не втрачає позицію, коли setPosition і setCompleted викликані в один тік', async () => {
    // Так робить плеєр: onProgress і onCompleted синхронно поруч при перетині порогу 90%.
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 80, 100);

    const positionCall = store.getState().setPosition('v1', 90, 100);
    const completedCall = store.getState().setCompleted('v1', true);
    await Promise.all([positionCall, completedCall]);

    expect(store.getState().progress.v1).toMatchObject({ positionSec: 90, completed: true });
  });

  it('не втрачає відмітку «переглянуто», коли виклики йдуть у зворотному порядку в один тік', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 80, 100);

    const completedCall = store.getState().setCompleted('v1', true);
    const positionCall = store.getState().setPosition('v1', 90, 100);
    await Promise.all([completedCall, positionCall]);

    expect(store.getState().progress.v1).toMatchObject({ positionSec: 90, completed: true });
  });
});
