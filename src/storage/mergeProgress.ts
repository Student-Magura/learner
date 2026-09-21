import type { ProgressMap } from '../types';

/**
 * Зливає локальний і віддалений прогрес per-video last-write-wins за updatedAt.
 * Конфлікт вирішується на рівні окремого відео, а не файлу цілком — тому перегляд
 * на телефоні й на ноутбуці в один день не затирає один одного.
 * При однакових updatedAt перемагає локальний: користувачеві передбачуваніше
 * бачити те, що він щойно робив на цьому пристрої.
 */
export function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...remote };
  for (const [fileId, record] of Object.entries(local)) {
    const existing = merged[fileId];
    if (!existing || record.updatedAt >= existing.updatedAt) {
      merged[fileId] = record;
    }
  }
  return merged;
}
