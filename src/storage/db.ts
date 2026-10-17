import { openDB } from 'idb';
import { mergeLibrary } from '../library/mergeLibrary';
import { mergeProgress } from './mergeProgress';
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type {
  CatalogEntry,
  CatalogSnapshot,
  Course,
  Library,
  ProgressMap,
  ProgressRecord,
  Subscription,
} from '../types';

export type { Course, ProgressMap, ProgressRecord } from '../types';

const DB_VERSION = 2;

/** У IndexedDB запис прогресу лежить разом із ключем, бо store має keyPath. */
type StoredProgress = ProgressRecord & { fileId: string };
type StoredSubscription = Subscription & { id: string };
/** У v1 курс знав, звідки він: 'catalog' чи власний. Тепер це знає бібліотека. */
type LegacyCourse = Course & { source?: 'catalog' | 'own' };

interface LearnerSchema extends DBSchema {
  courses: { key: string; value: Course };
  progress: { key: string; value: StoredProgress };
  meta: { key: string; value: { key: string; value: unknown } };
  library: { key: string; value: StoredSubscription };
  catalogs: { key: string; value: CatalogSnapshot };
}

type UpgradeTx = IDBPTransaction<LearnerSchema, StoreNames<LearnerSchema>[], 'versionchange'>;

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
  getLibrary(): Promise<Library>;
  putSubscription(id: string, sub: Subscription): Promise<void>;
  /** Як mergeIntoProgress, але для підписок: одна транзакція, нічого не видаляє. */
  mergeIntoLibrary(library: Library): Promise<Library>;
  getCatalogs(): Promise<CatalogSnapshot[]>;
  putCatalog(snapshot: CatalogSnapshot): Promise<void>;
  deleteCatalog(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
};

export type OpenOptions = {
  /** Id вбудованого каталогу: міграція v1 → v2 переносить у його знімок курси з source: 'catalog'. */
  builtinCatalogId?: string;
};

/**
 * v1 → v2: власні курси стають підписками, курси каталогу — знімком вбудованого каталогу.
 * Дерева лишаються на місці — після оновлення нічого не сканується заново.
 * Await тут лише на запитах цієї ж транзакції, тому вона не закривається посеред міграції.
 */
async function migrateV1Courses(tx: UpgradeTx, builtinCatalogId: string | undefined): Promise<void> {
  const courses = tx.objectStore('courses');
  const library = tx.objectStore('library');
  const builtin: CatalogEntry[] = [];

  for (const legacy of (await courses.getAll()) as LegacyCourse[]) {
    const { source, ...course } = legacy;
    if (source === 'catalog') {
      // Без вбудованого каталогу в збірці такий курс лишається кешем без посилань
      // і зникне при першому reconcile. Прогрес його лишається.
      if (builtinCatalogId) builtin.push({ id: course.id, title: course.title });
    } else {
      await library.put({
        id: course.id,
        kind: 'course',
        title: course.title,
        addedAt: course.addedAt,
        updatedAt: course.addedAt,
        removed: false,
      });
    }
    if (source !== undefined) await courses.put(course);
  }

  if (builtinCatalogId && builtin.length > 0) {
    await tx.objectStore('catalogs').put({
      id: builtinCatalogId,
      title: '',
      courses: builtin,
      lastSyncedAt: 0,
    });
  }
}

export async function openLearnerDb(
  name = 'learner',
  options: OpenOptions = {},
): Promise<LearnerDb> {
  const db: IDBPDatabase<LearnerSchema> = await openDB<LearnerSchema>(name, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        database.createObjectStore('courses', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'fileId' });
        database.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        database.createObjectStore('library', { keyPath: 'id' });
        database.createObjectStore('catalogs', { keyPath: 'id' });
        if (oldVersion === 1) void migrateV1Courses(tx, options.builtinCatalogId);
      }
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

    getLibrary: async () => {
      const library: Library = {};
      for (const { id, ...sub } of await db.getAll('library')) library[id] = sub;
      return library;
    },

    putSubscription: async (id, sub) => {
      await db.put('library', { id, ...sub });
    },

    mergeIntoLibrary: async (incoming) => {
      const tx = db.transaction('library', 'readwrite');
      const current: Library = {};
      for (const { id, ...sub } of await tx.store.getAll()) current[id] = sub;

      // Сховище першим — з тієї ж причини, що й у mergeIntoProgress.
      const merged = mergeLibrary(current, incoming);
      for (const [id, sub] of Object.entries(merged)) {
        await tx.store.put({ id, ...sub });
      }
      await tx.done;
      return merged;
    },

    getCatalogs: () => db.getAll('catalogs'),
    putCatalog: async (snapshot) => {
      await db.put('catalogs', snapshot);
    },
    deleteCatalog: async (id) => {
      await db.delete('catalogs', id);
    },

    getMeta: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    setMeta: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}
