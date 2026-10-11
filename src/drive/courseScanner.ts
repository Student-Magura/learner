import { naturalCompare } from './naturalSort';
import type { DriveApi, DriveFile } from './api';
import type { Course, FolderNode, TreeNode } from '../types';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Захист від циклів через ярлики Drive: реальні курси значно дрібніші. */
const MAX_DEPTH = 12;

function isVisible(file: DriveFile): boolean {
  return !file.trashed && !file.name.startsWith('.');
}

async function scanFolder(
  api: DriveApi,
  folderId: string,
  title: string,
  depth: number,
): Promise<FolderNode> {
  if (depth >= MAX_DEPTH) {
    return { id: folderId, kind: 'folder', title, children: [] };
  }

  const entries = (await api.listFolder(folderId)).filter(isVisible);
  const children: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.mimeType === FOLDER_MIME) {
      const sub = await scanFolder(api, entry.id, entry.name, depth + 1);
      // Папка без жодного відео в піддереві курсу не показує — лишився б порожній розділ.
      if (sub.children.length > 0) children.push(sub);
    } else if (entry.mimeType.startsWith('video/')) {
      children.push({
        id: entry.id,
        kind: 'video',
        title: entry.name,
        durationSec: entry.durationSec,
      });
    }
  }

  children.sort((a, b) => naturalCompare(a.title, b.title));
  return { id: folderId, kind: 'folder', title, children };
}

/**
 * Рекурсивно обходить папку Drive і будує дерево курсу.
 * Діти кожного вузла зберігаються вже відсортованими — порядок масиву є порядком курсу.
 */
export async function scanCourse(
  api: DriveApi,
  folderId: string,
  now: number = Date.now(),
): Promise<Course> {
  const root = await api.getFile(folderId);
  const tree = await scanFolder(api, folderId, root.name, 0);
  return { id: folderId, title: root.name, addedAt: now, tree, lastScannedAt: now };
}
