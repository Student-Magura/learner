import { createDocSync } from '../storage/docSync';
import { mergeLibrary, sameLibrary } from './mergeLibrary';
import { parseLibrary } from './parseLibrary';
import type { DocSync } from '../storage/docSync';
import type { LearnerDb } from '../storage/db';
import type { DriveApi } from '../drive/api';
import type { Library } from '../types';

export const LIBRARY_FILE = 'learner-library.json';

/** Підписки на каталоги й власні курси — окремим файлом, щоб не чіпати формат прогресу. */
export function createLibrarySync(
  db: LearnerDb,
  api: Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>,
  options: { debounceMs?: number } = {},
): DocSync<Library> {
  return createDocSync(db, api, {
    file: LIBRARY_FILE,
    parse: parseLibrary,
    merge: mergeLibrary,
    same: sameLibrary,
    empty: () => ({}),
    readLocal: () => db.getLibrary(),
    mergeIntoLocal: (library) => db.mergeIntoLibrary(library),
    metaKeys: { remoteModified: 'libraryRemoteModifiedTime', pushed: 'pushedLibrary' },
    debounceMs: options.debounceMs,
  });
}
