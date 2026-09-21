import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_FILE, createSyncEngine } from './syncEngine';
import { openLearnerDb } from './db';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

function rec(updatedAt: number, positionSec: number): ProgressRecord {
  return { positionSec, durationSec: 100, completed: false, updatedAt };
}

type FakeDrive = DriveApi & {
  remote: ProgressMap | null;
  modifiedTime: string;
  writes: number;
  downloads: number;
};

function fakeDrive(remote: ProgressMap | null = null): FakeDrive {
  const drive: FakeDrive = {
    remote,
    modifiedTime: '2026-09-20T10:00:00.000Z',
    writes: 0,
    downloads: 0,
    listFolder: vi.fn(async () => []),
    getFile: vi.fn(async () => ({
      id: 'x',
      name: 'x',
      mimeType: 'application/vnd.google-apps.folder',
      trashed: false,
      durationSec: null,
    })),
    statAppData: vi.fn(async () =>
      drive.remote === null ? null : { id: 'f1', modifiedTime: drive.modifiedTime },
    ),
    readAppData: vi.fn(async () => {
      if (drive.remote === null) return null;
      drive.downloads += 1;
      return { content: drive.remote, modifiedTime: drive.modifiedTime };
    }),
    writeAppData: vi.fn(async (_name: string, content: unknown) => {
      drive.writes += 1;
      drive.remote = content as ProgressMap;
      drive.modifiedTime = `2026-09-20T1${drive.writes}:00:00.000Z`;
      return { modifiedTime: drive.modifiedTime };
    }),
  };
  return drive;
}

/**
 * Дає дебоунсному проходу дійти до кінця: його IndexedDB-колбеки — макротаски
 * на setImmediate, який підміна таймерів навмисно не чіпає.
 */
async function waitForSync(drive: FakeDrive): Promise<void> {
  for (let i = 0; i < 50 && drive.writes === 0; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`sync-test-${counter}`);
});

describe('syncNow', () => {
  it('створює віддалений файл, коли його ще немає', async () => {
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));

    await createSyncEngine(db, drive).syncNow();

    expect(drive.writeAppData).toHaveBeenCalledWith(PROGRESS_FILE, { v1: rec(100, 10) });
  });

  it('вливає віддалені записи в локальну базу', async () => {
    const drive = fakeDrive({ v2: rec(200, 50) });
    await db.putProgressRecord('v1', rec(100, 10));

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(Object.keys(merged).sort()).toEqual(['v1', 'v2']);
    await expect(db.getProgress()).resolves.toHaveProperty('v2');
  });

  it('свіжіший віддалений запис перемагає локальний', async () => {
    const drive = fakeDrive({ v1: rec(500, 90) });
    await db.putProgressRecord('v1', rec(100, 10));

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(merged.v1?.positionSec).toBe(90);
  });

  it('свіжіший локальний запис виштовхується у віддалений файл', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    await db.putProgressRecord('v1', rec(500, 90));

    await createSyncEngine(db, drive).syncNow();

    expect(drive.remote?.v1?.positionSec).toBe(90);
  });

  it('не завантажує файл повторно, якщо modifiedTime не змінився', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    const engine = createSyncEngine(db, drive);

    await engine.syncNow();
    const afterFirst = drive.downloads;
    await engine.syncNow();

    expect(drive.downloads).toBe(afterFirst);
  });

  it('завантажує файл заново, коли modifiedTime змінився на іншому пристрої', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    const engine = createSyncEngine(db, drive);
    await engine.syncNow();

    drive.remote = { v1: rec(900, 99) };
    drive.modifiedTime = '2026-09-21T10:00:00.000Z';
    const merged = await engine.syncNow();

    expect(merged.v1?.positionSec).toBe(99);
  });

  it('не пише у Drive, коли нічого не змінилося', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive);

    // Перший прохід може пушити (немає збереженого знімка), тому міряємо steady state
    // від НЬОГО, а не від нуля: важливо, щоб третій прохід теж нічого не написав.
    await engine.syncNow();
    const afterFirst = drive.writes;
    await engine.syncNow();
    await engine.syncNow();

    expect(drive.writes).toBe(afterFirst);
  });

  it('пушить локальну зміну навіть якщо віддалений файл уже існував і не змінювався', async () => {
    // Регрес: push раніше залежав від remoteChanged (чи писав ІНШИЙ пристрій),
    // тож локальний прогрес, який зʼявився після першого успішного push, ніколи
    // не діставався до Drive, доки хтось інший не торкнеться файлу.
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive);

    await engine.syncNow();
    expect(drive.writes).toBe(1);

    await db.putProgressRecord('v2', rec(200, 20));
    await engine.syncNow();

    expect(drive.writes).toBe(2);
    expect(drive.remote?.v2?.positionSec).toBe(20);
  });

  it('не губить відмітку, що зʼявилася поки тривало читання віддаленого файлу', async () => {
    // Двопристроєвий сценарій: інший пристрій щось записав, тому цей робить pull.
    // Поки readAppData у польоті, користувач тисне «Переглянуто» — запис лягає в
    // IndexedDB уже після того, як syncEngine зробив свій знімок local.
    const drive = fakeDrive({ 'v-other': rec(200, 50) });
    await db.putProgressRecord('v1', rec(100, 10));

    drive.readAppData = vi.fn(async () => {
      await db.putProgressRecord('v-ticked', {
        positionSec: 0,
        durationSec: 100,
        completed: true,
        updatedAt: 400,
      });
      return { content: drive.remote, modifiedTime: drive.modifiedTime };
    });

    const merged = await createSyncEngine(db, drive).syncNow();

    // 1. Запис лишився у сховищі — саме те, що раніше знищував clear().
    await expect(db.getProgress()).resolves.toHaveProperty('v-ticked');
    // 2. Він же попав у результат злиття і в те, що поїхало в Drive, — інакше
    //    збережений знімок pushedProgress «замаскував» би його назавжди.
    expect(merged['v-ticked']?.completed).toBe(true);
    expect(drive.remote?.['v-ticked']?.completed).toBe(true);
  });

  it('ігнорує зламані записи у віддаленому файлі, не втрачаючи решту', async () => {
    const drive = fakeDrive({
      good: rec(100, 10),
      broken: { positionSec: 'ой' } as unknown as ProgressRecord,
    });

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(merged).toHaveProperty('good');
    expect(merged).not.toHaveProperty('broken');
  });

  it('переживає віддалений вміст, що взагалі не є обʼєктом', async () => {
    const drive = fakeDrive({} as ProgressMap);
    drive.readAppData = vi.fn(async () => ({
      content: 'не той формат',
      modifiedTime: drive.modifiedTime,
    }));

    await expect(createSyncEngine(db, drive).syncNow()).resolves.toEqual({});
  });

  it('відкидає віддалений запис з відʼємним positionSec, лишаючи сусідній коректний', async () => {
    const drive = fakeDrive({
      good: rec(100, 10),
      negative: rec(200, -5),
    });

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(merged).toHaveProperty('good');
    expect(merged).not.toHaveProperty('negative');
  });
});

describe('scheduleSync і flush', () => {
  it('scheduleSync не синхронізує одразу, а після дебоунсу', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    expect(drive.writeAppData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    // Прохід синхронізації робить кілька IndexedDB-обертів, а їхні колбеки
    // йдуть через setImmediate (навмисно не підмінений — див. vite.config.ts),
    // тому advanceTimersByTimeAsync сам по собі не дочекається кінця ланцюжка.
    await waitForSync(drive);
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('кілька scheduleSync підряд дають одну синхронізацію', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(4_000);
    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(4_000);
    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(10_000);
    await waitForSync(drive);

    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flush синхронізує негайно, скасовуючи відкладений таймер', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    await engine.flush();
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('помилка синхронізації не валить застосунок', async () => {
    const drive = fakeDrive(null);
    drive.statAppData = vi.fn(async () => {
      throw new Error('офлайн');
    });
    await expect(createSyncEngine(db, drive).flush()).resolves.toBeUndefined();
  });
});
