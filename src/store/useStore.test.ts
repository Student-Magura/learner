import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_REFRESH_MS, SCAN_CONCURRENCY, createLearnerStore } from './useStore';
import { createLibrarySync } from '../library/librarySync';
import { fakeAppData } from '../test/fakeAppData';
import { openLearnerDb } from '../storage/db';
import { DriveError } from '../drive/api';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { LearnerDb } from '../storage/db';
import type { DriveApi, DriveFile } from '../drive/api';
import type { DocSync } from '../storage/docSync';
import type { SyncEngine } from '../storage/syncEngine';
import type { StoreDeps } from './useStore';
import type { Library, ProgressMap, Subscription } from '../types';

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

function fakeLibrarySync(merged: Library = {}): DocSync<Library> {
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
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync() });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().progress.v1?.positionSec).toBe(5);
  });

  it('вливає результат синхронізації в стан', async () => {
    const sync = fakeSync({
      remote: { positionSec: 50, durationSec: 100, completed: false, updatedAt: 9 },
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync() });

    await store.getState().init();

    expect(store.getState().progress.remote?.positionSec).toBe(50);
  });

  it('готовий до роботи навіть коли синхронізація впала', async () => {
    const sync = fakeSync();
    sync.syncNow = vi.fn(async () => {
      throw new Error('офлайн');
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync() });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
  });
});

describe('syncFromRemote і flushSync', () => {
  it('вливає прогрес з іншого пристрою в стан, не чекаючи перезавантаження', async () => {
    // Без цього довгоживуча вкладка ніколи не бачила чужого прогресу.
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync(), now: () => 1 });
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
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync(), now: () => clock });
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
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 100);

    await expect(store.getState().syncFromRemote()).resolves.toBeUndefined();
    expect(store.getState().progress.v1?.positionSec).toBe(10);
  });

  it('flushSync форсує відкладену синхронізацію', async () => {
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync() });
    await store.getState().init();

    await store.getState().flushSync();

    expect(sync.flush).toHaveBeenCalledTimes(1);
  });
});

describe('addCourse', () => {
  it('додає курс за посиланням на папку', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();

    await store.getState().addCourse(`https://drive.google.com/drive/folders/${ROOT_ID}`);

    expect(store.getState().courses).toHaveLength(1);
    expect(store.getState().courses[0]?.title).toBe('Product Management Course');
    await expect(db.getCourses()).resolves.toHaveLength(1);
  });

  it('відмовляється від посилання, що не є папкою, зі зрозумілим текстом', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync() });
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
    const store = createLearnerStore({ db, api, sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/не знайдено|доступ/i);
  });

  it('перетворює 403 від Drive у підказку про права доступу', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new DriveError(403, 'Drive API 403 Forbidden');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/доступ/i);
  });

  it('мережевий збій при додаванні курсу — зрозуміле повідомлення про зʼєднання', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/Немає зʼєднання з Google Drive/);
  });

  it('повторне додавання того самого курсу не створює дубль', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();

    await store.getState().addCourse(ROOT_ID);
    await store.getState().addCourse(ROOT_ID);

    expect(store.getState().courses).toHaveLength(1);
  });
});

describe('rescanCourse', () => {
  it('перетворює 403 від Drive у зрозумілу підказку, а не ковтає помилку', async () => {
    const api = fakeApi();
    const store = createLearnerStore({ db, api, sync: fakeSync(), librarySync: fakeLibrarySync() });
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
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync() });
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);
    await store.getState().setPosition('v-funnel', 42, 600);

    await store.getState().removeCourse(ROOT_ID);
    await store.getState().whenIdle();

    expect(store.getState().courses).toHaveLength(0);
    await expect(db.getProgress()).resolves.toHaveProperty('v-funnel');
  });
});

describe('setPosition', () => {
  it('записує позицію й тривалість і планує синхронізацію', async () => {
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, librarySync: fakeLibrarySync(), now: () => 1000 });
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
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setCompleted('v1', true);

    await store.getState().setPosition('v1', 10, 600);

    expect(store.getState().progress.v1?.completed).toBe(true);
  });

  it('зберігає вже відому тривалість, коли плеєр передав null', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    await store.getState().setPosition('v1', 20, null);

    expect(store.getState().progress.v1?.durationSec).toBe(600);
  });
});

describe('setCompleted', () => {
  it('ручна відмітка перебиває автоматичну й в обидва боки', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => 5 });
    await store.getState().init();

    await store.getState().setCompleted('v1', true);
    expect(store.getState().progress.v1?.completed).toBe(true);

    await store.getState().setCompleted('v1', false);
    expect(store.getState().progress.v1?.completed).toBe(false);
  });

  it('оновлює updatedAt, щоб відмітка перемогла при злитті', async () => {
    let clock = 100;
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => clock });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    clock = 900;
    await store.getState().setCompleted('v1', true);

    expect(store.getState().progress.v1?.updatedAt).toBe(900);
  });

  it('не втрачає позицію, коли setPosition і setCompleted викликані в один тік', async () => {
    // Так робить плеєр: onProgress і onCompleted синхронно поруч при перетині порогу 90%.
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 80, 100);

    const positionCall = store.getState().setPosition('v1', 90, 100);
    const completedCall = store.getState().setCompleted('v1', true);
    await Promise.all([positionCall, completedCall]);

    expect(store.getState().progress.v1).toMatchObject({ positionSec: 90, completed: true });
  });

  it('не втрачає відмітку «переглянуто», коли виклики йдуть у зворотному порядку в один тік', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), librarySync: fakeLibrarySync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 80, 100);

    const completedCall = store.getState().setCompleted('v1', true);
    const positionCall = store.getState().setPosition('v1', 90, 100);
    await Promise.all([completedCall, positionCall]);

    expect(store.getState().progress.v1).toMatchObject({ positionSec: 90, completed: true });
  });
});

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

    it('прохід, що впав, пишеться в консоль, а черга йде далі', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let broken = false;
      const store = catalogStore(driveWith(), {
        now: () => {
          if (broken) throw new Error('boom');
          return 1_000;
        },
      });
      await started(store);

      broken = true;
      await store.getState().reconcile();
      expect(warn).toHaveBeenCalledOnce();

      broken = false;
      await store.getState().reconcile();
      expect(store.getState().courses).toHaveLength(2);
      warn.mockRestore();
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
    it('мережевий збій — зрозуміле повідомлення про зʼєднання', async () => {
      const api = driveWith();
      const store = catalogStore(api);
      await started(store);
      api.getFile = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });

      await expect(store.getState().previewCatalog(TEAM_ID)).rejects.toThrow(
        /Немає зʼєднання з Google Drive/,
      );
    });

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
