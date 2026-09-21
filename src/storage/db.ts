import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Course, ProgressMap, ProgressRecord } from '../types';

export type { Course, ProgressMap, ProgressRecord } from '../types';

const DB_VERSION = 1;

/** У IndexedDB запис прогресу лежить разом із ключем, бо store має keyPath. */
type StoredProgress = ProgressRecord & { fileId: string };

interface LearnerSchema extends DBSchema {
  courses: { key: string; value: Course };
  progress: { key: string; value: StoredProgress };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type LearnerDb = {
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  putCourse(course: Course): Promise<void>;
  deleteCourse(id: string): Promise<void>;
  getProgress(): Promise<ProgressMap>;
  putProgressRecord(fileId: string, record: ProgressRecord): Promise<void>;
  replaceProgress(map: ProgressMap): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
};

export async function openLearnerDb(name = 'learner'): Promise<LearnerDb> {
  const db: IDBPDatabase<LearnerSchema> = await openDB<LearnerSchema>(name, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('courses', { keyPath: 'id' });
      database.createObjectStore('progress', { keyPath: 'fileId' });
      database.createObjectStore('meta', { keyPath: 'key' });
    },
  });

  return {
    getCourses: () => db.getAll('courses'),
    getCourse: (id) => db.get('courses', id),
    putCourse: async (course) => {
      await db.put('courses', course);
    },
    // Видалення курсу свідомо не торкається прогресу: це єдині невідтворювані дані.
    deleteCourse: async (id) => {
      await db.delete('courses', id);
    },

    getProgress: async () => {
      const rows = await db.getAll('progress');
      const map: ProgressMap = {};
      for (const { fileId, ...record } of rows) map[fileId] = record;
      return map;
    },

    putProgressRecord: async (fileId, record) => {
      await db.put('progress', { fileId, ...record });
    },

    replaceProgress: async (map) => {
      const tx = db.transaction('progress', 'readwrite');
      await tx.store.clear();
      for (const [fileId, record] of Object.entries(map)) {
        await tx.store.put({ fileId, ...record });
      }
      await tx.done;
    },

    getMeta: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    setMeta: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}
