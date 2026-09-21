import { mergeProgress } from './mergeProgress';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

export const PROGRESS_FILE = 'learner-progress.json';
export const SYNC_DEBOUNCE_MS = 10_000;

const REMOTE_MODIFIED_KEY = 'remoteModifiedTime';

export type SyncEngine = {
  syncNow(): Promise<ProgressMap>;
  scheduleSync(): void;
  flush(): Promise<void>;
};

/**
 * Файл поза контролем застосунку може містити зіпсовані або старі дані.
 * Окрім типів перевіряємо діапазони: відʼємний positionSec опустив би
 * прогрес-бар нижче нуля, а NaN/Infinity проходять `typeof === 'number'`.
 */
function isProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.positionSec === 'number' &&
    Number.isFinite(r.positionSec) &&
    r.positionSec >= 0 &&
    typeof r.completed === 'boolean' &&
    typeof r.updatedAt === 'number' &&
    Number.isFinite(r.updatedAt) &&
    (r.durationSec === null ||
      (typeof r.durationSec === 'number' && Number.isFinite(r.durationSec) && r.durationSec >= 0))
  );
}

/**
 * Віддалений файл міг записати старіша версія застосунку або зіпсувати збій.
 * Зламані записи відкидаємо поштучно, щоб не втратити решту прогресу.
 */
function parseProgress(content: unknown): ProgressMap {
  if (typeof content !== 'object' || content === null) return {};
  const out: ProgressMap = {};
  for (const [fileId, value] of Object.entries(content as Record<string, unknown>)) {
    if (isProgressRecord(value)) out[fileId] = value;
  }
  return out;
}

function sameProgress(a: ProgressMap, b: ProgressMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right !== undefined &&
      left!.positionSec === right.positionSec &&
      left!.completed === right.completed &&
      left!.updatedAt === right.updatedAt &&
      left!.durationSec === right.durationSec
    );
  });
}

export function createSyncEngine(
  db: LearnerDb,
  api: DriveApi,
  options: { debounceMs?: number } = {},
): SyncEngine {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<ProgressMap> | null = null;

  async function run(): Promise<ProgressMap> {
    // Незалежні читання запускаємо паралельно.
    const [local, stat, lastSeen] = await Promise.all([
      db.getProgress(),
      api.statAppData(PROGRESS_FILE),
      db.getMeta<string>(REMOTE_MODIFIED_KEY),
    ]);

    // Файл не змінився з нашого останнього злиття — тягнути його немає сенсу.
    const remoteChanged = stat !== null && stat.modifiedTime !== lastSeen;

    let remote: ProgressMap = {};
    if (remoteChanged) {
      const payload = await api.readAppData(PROGRESS_FILE);
      remote = parseProgress(payload?.content);
    }

    const merged = mergeProgress(local, remote);

    if (!sameProgress(merged, local)) {
      await db.replaceProgress(merged);
    }

    const mustPush = stat === null || (remoteChanged && !sameProgress(merged, remote));
    if (mustPush) {
      const { modifiedTime } = await api.writeAppData(PROGRESS_FILE, merged);
      await db.setMeta(REMOTE_MODIFIED_KEY, modifiedTime);
    } else if (stat !== null) {
      await db.setMeta(REMOTE_MODIFIED_KEY, stat.modifiedTime);
    }

    return merged;
  }

  function syncNow(): Promise<ProgressMap> {
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
        // Прогрес уже в IndexedDB; злиття відбудеться при наступному запуску.
      }
    },
  };
}
