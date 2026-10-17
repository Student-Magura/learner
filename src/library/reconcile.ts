import { FOLDER_MIME } from '../drive/courseScanner';
import { naturalCompare } from '../drive/naturalSort';
import type { DriveFile } from '../drive/api';
import type { CatalogEntry, CatalogSnapshot, Library } from '../types';

/** Вбудований першим, далі додані за addedAt. Вбудований — рівно раз, хай що лежить у Library. */
export function activeCatalogIds(library: Library, builtinCatalogId?: string): string[] {
  const added = Object.entries(library)
    .filter(([id, sub]) => sub.kind === 'catalog' && !sub.removed && id !== builtinCatalogId)
    .sort(([, a], [, b]) => a.addedAt - b.addedAt)
    .map(([id]) => id);
  return builtinCatalogId ? [builtinCatalogId, ...added] : added;
}

export function ownCourseIds(library: Library): string[] {
  return Object.entries(library)
    .filter(([, sub]) => sub.kind === 'course' && !sub.removed)
    .sort(([, a], [, b]) => a.addedAt - b.addedAt)
    .map(([id]) => id);
}

export type ReconcileInput = {
  library: Library;
  builtinCatalogId?: string;
  catalogs: Record<string, CatalogSnapshot>;
  cachedCourseIds: string[];
};

export type ReconcilePlan = {
  /** Курси, на які щось посилається, але дерева в кеші ще немає. */
  toScan: string[];
  /** Курси в кеші, на які більше ніщо не посилається. Прогрес їхній лишається. */
  toDelete: string[];
  /** Знімки каталогів, що вже не активні. */
  staleCatalogs: string[];
};

/**
 * Порівнює те, що обрав користувач, із тим, що лежить у кеші.
 * Курс потрібен, якщо він власний або є в знімку хоча б одного активного каталогу.
 */
export function planReconcile({
  library,
  builtinCatalogId,
  catalogs,
  cachedCourseIds,
}: ReconcileInput): ReconcilePlan {
  const active = new Set(activeCatalogIds(library, builtinCatalogId));
  const referenced = new Set(ownCourseIds(library));
  for (const id of active) {
    for (const entry of catalogs[id]?.courses ?? []) referenced.add(entry.id);
  }
  const cached = new Set(cachedCourseIds);

  return {
    toScan: [...referenced].filter((id) => !cached.has(id)),
    toDelete: cachedCourseIds.filter((id) => !referenced.has(id)),
    staleCatalogs: Object.keys(catalogs).filter((id) => !active.has(id)),
  };
}

/** Підпапки каталогу, що є курсами: як і сканер, пропускаємо смітник і приховані. */
export function catalogEntries(files: DriveFile[]): CatalogEntry[] {
  return files
    .filter((f) => f.mimeType === FOLDER_MIME && !f.trashed && !f.name.startsWith('.'))
    .map((f) => ({ id: f.id, title: f.name }))
    .sort((a, b) => naturalCompare(a.title, b.title));
}
