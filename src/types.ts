/** Поріг автоматичної відмітки «переглянуто» — 90% тривалості. */
export const COMPLETION_THRESHOLD = 0.9;

export type VideoNode = {
  id: string;
  kind: 'video';
  title: string;
  /** Секунди. null, якщо Drive не віддав тривалість і плеєр її ще не повідомив. */
  durationSec: number | null;
};

export type FolderNode = {
  id: string;
  kind: 'folder';
  title: string;
  /** Уже відсортовані natural sort під час сканування. Порядок масиву = порядок курсу. */
  children: TreeNode[];
};

export type TreeNode = FolderNode | VideoNode;

export type Course = {
  /** Drive folderId кореневої папки курсу. */
  id: string;
  title: string;
  addedAt: number;
  tree: FolderNode;
  lastScannedAt: number;
};

export type ProgressRecord = {
  positionSec: number;
  durationSec: number | null;
  completed: boolean;
  /** epoch ms. Основа для per-video last-write-wins при синхронізації. */
  updatedAt: number;
};

/** Ключ — Drive fileId відео. */
export type ProgressMap = Record<string, ProgressRecord>;

export function emptyProgress(): ProgressMap {
  return {};
}

/**
 * Те, що користувач обрав сам: каталог або власний курс. Синхронізується між
 * пристроями через learner-library.json. Ключ у Library — Drive folderId.
 */
export type Subscription = {
  kind: 'catalog' | 'course';
  /** Назва папки на момент додавання — щоб на новому пристрої картка мала підпис ще до скану. */
  title: string;
  addedAt: number;
  /** epoch ms. Основа для per-entry last-write-wins. */
  updatedAt: number;
  /** Tombstone: «прибрати» мусить дійти до інших пристроїв. */
  removed: boolean;
};

export type Library = Record<string, Subscription>;

/** Підпапка каталогу — курс, відомий за назвою ще до сканування. */
export type CatalogEntry = { id: string; title: string };

/** Локальний кеш складу каталогу. Завжди перебудовується з Drive. */
export type CatalogSnapshot = {
  /** Drive folderId каталогу. */
  id: string;
  /** Назва папки Drive; порожня, поки каталог не опитано після міграції. */
  title: string;
  courses: CatalogEntry[];
  lastSyncedAt: number;
};

/** Що знайшлося за посиланням на каталог — показується до підтвердження. */
export type CatalogPreview = { id: string; title: string; courses: CatalogEntry[] };
