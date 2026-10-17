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

  it('flush під час уже запущеного проходу пушить і підписку, що зʼявилась посеред нього', async () => {
    const drive = fakeAppData();
    const sync = createLibrarySync(db, drive);
    await db.putSubscription('cat1', sub(10));

    // Перший прохід зависає на мережевому записі — уже ПІСЛЯ mergeIntoLocal.
    const realWrite = drive.writeAppData;
    let reached!: () => void;
    const atWrite = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    drive.writeAppData = async (name, content) => {
      calls += 1;
      if (calls === 1) {
        reached();
        await gate;
      }
      return realWrite(name, content);
    };

    const first = sync.syncNow();
    await atWrite;
    // Запис користувача, що приїхав після злиття першого проходу.
    await db.putSubscription('cat2', sub(11));
    const flushed = sync.flush();
    release();
    await Promise.all([first, flushed]);

    const remote = drive.files[LIBRARY_FILE]?.content as Record<string, unknown>;
    expect(Object.keys(remote).sort()).toEqual(['cat1', 'cat2']);
  });
});
