import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLearnerStore } from './useStore';
import { openLearnerDb } from '../storage/db';
import { DriveError } from '../drive/api';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { LearnerDb } from '../storage/db';
import type { DriveApi, DriveFile } from '../drive/api';
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

describe('syncCatalog', () => {
  const CATALOG_ID = 'catalog-fixture-0000000000000';
  const A_ID = 'catalog-course-a-00000000000';
  const B_ID = 'catalog-course-b-00000000000';
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

  /** Каталог із двох курсів; ROOT_ID — курс, який раніше могли додати вручну. */
  function catalogApi(entries = [folder(A_ID, 'Курс А'), folder(B_ID, 'Курс Б')]): DriveApi {
    const listing: Record<string, DriveFile[]> = {
      ...COURSE_LISTING,
      [CATALOG_ID]: [...entries, { ...video('stray'), name: 'не курс.mp4' }],
      [A_ID]: [video('vA')],
      [B_ID]: [video('vB')],
    };
    const files: Record<string, DriveFile> = {
      [ROOT_ID]: ROOT_FILE,
      ...Object.fromEntries(entries.map((e) => [e.id, e])),
    };
    return {
      ...fakeApi(),
      listFolder: vi.fn(async (id: string) => listing[id] ?? []),
      getFile: vi.fn(async (id: string) => files[id]!),
    };
  }

  function catalogStore(api: DriveApi) {
    return createLearnerStore({ db, api, sync: fakeSync(), catalogFolderId: CATALOG_ID });
  }

  it('додає кожну підпапку каталогу як курс каталогу', async () => {
    const store = catalogStore(catalogApi());
    await store.getState().init();

    await store.getState().syncCatalog();

    const courses = store.getState().courses;
    expect(courses.map((c) => c.title).sort()).toEqual(['Курс А', 'Курс Б']);
    expect(courses.every((c) => c.source === 'catalog')).toBe(true);
    await expect(db.getCourses()).resolves.toHaveLength(2);
  });

  it('init не чекає на каталог, а запускає його у фоні', async () => {
    const api = catalogApi();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const list = api.listFolder;
    api.listFolder = vi.fn(async (id: string) => {
      if (id === CATALOG_ID) await gate;
      return list(id);
    });
    const store = catalogStore(api);

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().catalogSyncing).toBe(true);
    release();
    await store.getState().syncCatalog();
    expect(store.getState().catalogSyncing).toBe(false);
    expect(store.getState().courses).toHaveLength(2);
  });

  it('не пересканьовує курс каталогу, який уже є', async () => {
    const api = catalogApi();
    const store = catalogStore(api);
    await store.getState().init();
    await store.getState().syncCatalog();
    vi.mocked(api.listFolder).mockClear();

    await store.getState().syncCatalog();

    expect(api.listFolder).toHaveBeenCalledTimes(1);
    expect(api.listFolder).toHaveBeenCalledWith(CATALOG_ID);
  });

  it('прибирає курс, якого більше немає в каталозі, але зберігає прогрес', async () => {
    const store = catalogStore(catalogApi());
    await store.getState().init();
    await store.getState().syncCatalog();
    await store.getState().setPosition('vB', 30, 60);

    const shrunk = createLearnerStore({
      db,
      api: catalogApi([folder(A_ID, 'Курс А')]),
      sync: fakeSync(),
      catalogFolderId: CATALOG_ID,
    });
    await shrunk.getState().init();
    await shrunk.getState().syncCatalog();

    expect(shrunk.getState().courses.map((c) => c.id)).toEqual([A_ID]);
    await expect(db.getProgress()).resolves.toHaveProperty('vB');
  });

  it('не чіпає власні курси, яких немає в каталозі', async () => {
    const store = catalogStore(catalogApi());
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);

    await store.getState().syncCatalog();

    const own = store.getState().courses.find((c) => c.id === ROOT_ID);
    expect(own?.source).not.toBe('catalog');
  });

  it('власний курс, що опинився в каталозі, стає курсом каталогу без дубля', async () => {
    const api = catalogApi([folder(ROOT_ID, 'Product Management Course')]);
    const store = catalogStore(api);
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);

    await store.getState().syncCatalog();

    expect(store.getState().courses).toHaveLength(1);
    expect(store.getState().courses[0]?.source).toBe('catalog');
    expect((await db.getCourse(ROOT_ID))?.source).toBe('catalog');
  });

  it('збій скану одного курсу не заважає іншим', async () => {
    const api = catalogApi();
    const getFile = api.getFile;
    api.getFile = vi.fn(async (id: string) => {
      if (id === A_ID) throw new DriveError(500, 'Drive API 500');
      return getFile(id);
    });
    const store = catalogStore(api);
    await store.getState().init();

    await store.getState().syncCatalog();

    expect(store.getState().courses.map((c) => c.id)).toEqual([B_ID]);
    expect(store.getState().catalogSyncing).toBe(false);
  });

  it('офлайн лишає закешовані курси каталогу на місці', async () => {
    const api = catalogApi();
    const store = catalogStore(api);
    await store.getState().init();
    await store.getState().syncCatalog();

    api.listFolder = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(store.getState().syncCatalog()).resolves.toBeUndefined();

    expect(store.getState().courses).toHaveLength(2);
    expect(store.getState().catalogSyncing).toBe(false);
  });

  it('одночасні виклики злипаються в одну синхронізацію', async () => {
    const api = catalogApi();
    const store = catalogStore(api);
    await store.getState().init();
    await store.getState().syncCatalog();
    vi.mocked(api.listFolder).mockClear();

    await Promise.all([store.getState().syncCatalog(), store.getState().syncCatalog()]);

    expect(api.listFolder).toHaveBeenCalledTimes(1);
  });

  it('без catalogFolderId нічого не робить', async () => {
    const api = catalogApi();
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();

    await store.getState().syncCatalog();

    expect(api.listFolder).not.toHaveBeenCalled();
    expect(store.getState().catalogSyncing).toBe(false);
  });

  it('rescan курсу каталогу лишає його в каталозі', async () => {
    const store = catalogStore(catalogApi());
    await store.getState().init();
    await store.getState().syncCatalog();

    await store.getState().rescanCourse(A_ID);

    expect(store.getState().courses.find((c) => c.id === A_ID)?.source).toBe('catalog');
  });

  it('addCourse відмовляє курсу, який уже є в каталозі', async () => {
    const store = catalogStore(catalogApi());
    await store.getState().init();
    await store.getState().syncCatalog();

    await expect(
      store.getState().addCourse(`https://drive.google.com/drive/folders/${A_ID}`),
    ).rejects.toThrow(/каталоз/i);
    expect(store.getState().courses.find((c) => c.id === A_ID)?.source).toBe('catalog');
  });
});
