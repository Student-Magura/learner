import { openDB } from 'idb';
import { mergeProgress } from './mergeProgress';
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
  /**
   * Вливає `map` у те, що ЗАРАЗ у сховищі, одною readwrite-транзакцією, і
   * повертає результат. Нічого не видаляє: запис, який зʼявився, поки
   * викликач ходив у мережу, мусить вижити (див. syncEngine).
   */
  mergeIntoProgress(map: ProgressMap): Promise<ProgressMap>;
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

    mergeIntoProgress: async (map) => {
      const tx = db.transaction('progress', 'readwrite');
      const rows = await tx.store.getAll();
      const current: ProgressMap = {};
      for (const { fileId, ...record } of rows) current[fileId] = record;

      // Поточний вміст сховища йде першим аргументом: при однаковому updatedAt
      // mergeProgress лишає перший, а це саме той бік, куди міг приїхати свіжий
      // локальний запис, поки викликач був у мережі.
      const merged = mergeProgress(current, map);
      for (const [fileId, record] of Object.entries(merged)) {
        await tx.store.put({ fileId, ...record });
      }
      await tx.done;
      return merged;
    },

    getMeta: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    setMeta: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}
