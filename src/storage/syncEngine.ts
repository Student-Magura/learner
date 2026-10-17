import { createDocSync } from './docSync';
import { mergeProgress } from './mergeProgress';
import type { DocSync } from './docSync';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

export { SYNC_DEBOUNCE_MS } from './docSync';
export const PROGRESS_FILE = 'learner-progress.json';

export type SyncEngine = DocSync<ProgressMap>;

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
  api: Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>,
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
