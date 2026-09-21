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
