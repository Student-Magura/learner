import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { DriveError } from '../drive/api';
import { scanCourse } from '../drive/courseScanner';
import { parseFolderId } from '../drive/parseFolderUrl';
import { mergeLibrary, sameLibrary } from '../library/mergeLibrary';
import { activeCatalogIds, catalogEntries, planReconcile } from '../library/reconcile';
import { mergeProgress } from '../storage/mergeProgress';
import type { DriveApi } from '../drive/api';
import type { CatalogStatus, CourseStatus } from '../library/sections';
import type { DocSync } from '../storage/docSync';
import type { LearnerDb } from '../storage/db';
import type { SyncEngine } from '../storage/syncEngine';
import type {
  CatalogPreview,
  CatalogSnapshot,
  Course,
  Library,
  ProgressMap,
  ProgressRecord,
  Subscription,
} from '../types';

/** Фокус вкладки перевіряє каталоги на нові курси не частіше за це. */
export const CATALOG_REFRESH_MS = 10 * 60 * 1000;
/** Новий пристрій може отримати десятки курсів разом — не валимо Drive паралельними сканами. */
export const SCAN_CONCURRENCY = 4;

export type StoreDeps = {
  db: LearnerDb;
  api: DriveApi;
  sync: SyncEngine;
  librarySync: DocSync<Library>;
  /** Каталог збірки (VITE_CATALOG_FOLDER_ID): є в кожного й не прибирається. */
  builtinCatalogId?: string;
  now?: () => number;
};

export type LearnerState = {
  courses: Course[];
  progress: ProgressMap;
  library: Library;
  catalogs: Record<string, CatalogSnapshot>;
  catalogStatus: Record<string, CatalogStatus>;
  courseStatus: Record<string, CourseStatus>;
  builtinCatalogId: string | undefined;
  ready: boolean;
  init(): Promise<void>;
  /** Опитати всі активні каталоги й привести кеш у відповідність до підписок. */
  reconcile(): Promise<void>;
  /** Чекає, поки фонова черга reconcile спорожніє. Потрібне тестам; UI на нього не чекає. */
  whenIdle(): Promise<void>;
  /** Підтягує прогрес і бібліотеку з інших пристроїв — при старті й поверненні у вкладку. */
  syncFromRemote(): Promise<void>;
  /** Форсує відкладені синхронізації — на pagehide, поки вкладка ще жива. */
  flushSync(): Promise<void>;
  /** Крок 1 додавання каталогу: що лежить за посиланням. Нічого не записує. */
  previewCatalog(input: string): Promise<CatalogPreview>;
  /** Крок 2: підписка, знімок із передперегляду, скан курсів у фоні. */
  addCatalog(preview: CatalogPreview): Promise<void>;
  removeCatalog(id: string): Promise<void>;
  addCourse(input: string): Promise<Course>;
  removeCourse(id: string): Promise<void>;
  rescanCourse(id: string): Promise<void>;
  setPosition(fileId: string, positionSec: number, durationSec: number | null): Promise<void>;
  setCompleted(fileId: string, completed: boolean): Promise<void>;
};

function isAccessError(cause: unknown): boolean {
  return cause instanceof DriveError && (cause.status === 404 || cause.status === 403);
}

/** «Drive API 404» користувачеві нічого не каже — перекладаємо на людську мову. */
function rethrowFriendly(cause: unknown): never {
  if (isAccessError(cause)) {
    throw new Error(
      'Папку не знайдено або до неї немає доступу. Перевірте посилання і те, ' +
        'що папкою поділилися з вашим акаунтом.',
    );
  }
  throw cause;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

export function createLearnerStore(
  deps: StoreDeps,
): UseBoundStore<StoreApi<LearnerState>> {
  const { db, api, sync, librarySync, builtinCatalogId } = deps;
  const now = deps.now ?? (() => Date.now());

  return create<LearnerState>((set, get) => {
    /**
     * Пише запис і локально, і в IndexedDB, і планує злиття у Drive.
     * Приймає будівник, а не готовий запис: злиття з попереднім станом відбувається
     * в момент виклику, проти ПОТОЧНОГО get().progress, а не знімка, зробленого до await.
     */
    async function writeRecord(
      fileId: string,
      build: (previous: ProgressRecord | undefined) => ProgressRecord,
    ): Promise<void> {
      const record = build(get().progress[fileId]);
      // Стан оновлюємо ДО await: інакше другий виклик у тому самому тіку прочитав би
      // застарілий знімок і перезаписав би поле першого старим значенням. Плеєр
      // викликає onProgress і onCompleted синхронно поруч, тому це не рідкісна гонка.
      set({ progress: { ...get().progress, [fileId]: record } });
      await db.putProgressRecord(fileId, record);
      sync.scheduleSync();
    }

    function activeSubscription(id: string): Subscription | undefined {
      const sub = get().library[id];
      return sub && !sub.removed ? sub : undefined;
    }

    /**
     * Локальна зміна підписки. Стан оновлюється синхронно, до першого await, —
     * на це покладаються addCourse і addCatalog. updatedAt строго більший за
     * попередній: інакше пристрій, чий годинник відстає, не зміг би прибрати те,
     * що додав пристрій із годинником, що поспішає.
     */
    async function writeSubscription(
      id: string,
      sub: Omit<Subscription, 'updatedAt'>,
    ): Promise<void> {
      const previous = get().library[id];
      const next: Subscription = {
        ...sub,
        updatedAt: Math.max(now(), (previous?.updatedAt ?? 0) + 1),
      };
      set({ library: { ...get().library, [id]: next } });
      await db.putSubscription(id, next);
      // Без дебаунсу: зміна рідкісна, а закрита одразу вкладка не мусить її загубити.
      void librarySync.flush();
    }

    function setCatalogStatus(id: string, status: CatalogStatus | null): void {
      const current = get().catalogStatus;
      set({ catalogStatus: status ? { ...current, [id]: status } : without(current, id) });
    }

    function setCourseStatus(id: string, status: CourseStatus | null): void {
      const current = get().courseStatus;
      set({ courseStatus: status ? { ...current, [id]: status } : without(current, id) });
    }

    async function putCourse(course: Course): Promise<void> {
      await db.putCourse(course);
      set({ courses: [...get().courses.filter((c) => c.id !== course.id), course] });
    }

    async function refreshCatalog(id: string): Promise<void> {
      const before = get().catalogStatus[id] ?? null;
      setCatalogStatus(id, 'syncing');
      try {
        const files = await api.listFolder(id);
        // Назва потрібна лише раз: listFolder її не дає, а getFile — зайвий запит щоразу.
        const title = get().catalogs[id]?.title || (await api.getFile(id)).name;
        const snapshot: CatalogSnapshot = {
          id,
          title,
          courses: catalogEntries(files),
          lastSyncedAt: now(),
        };
        await db.putCatalog(snapshot);
        set({ catalogs: { ...get().catalogs, [id]: snapshot } });
        setCatalogStatus(id, null);
      } catch (cause) {
        // Офлайн — норма: лишаємо збережений знімок і попередній стан без тривоги.
        setCatalogStatus(id, isAccessError(cause) ? 'no-access' : before === 'syncing' ? null : before);
      }
    }

    async function scanOne(id: string): Promise<void> {
      setCourseStatus(id, 'scanning');
      try {
        await putCourse(await scanCourse(api, id, now()));
        setCourseStatus(id, null);
      } catch (cause) {
        setCourseStatus(id, isAccessError(cause) ? 'no-access' : 'failed');
      }
    }

    /** Стирає непотрібне з кешу й сканує бракуюче. Мережі не чіпає, крім сканів. */
    async function applyPlan(): Promise<void> {
      const { library, catalogs, courses } = get();
      const plan = planReconcile({
        library,
        builtinCatalogId,
        catalogs,
        cachedCourseIds: courses.map((c) => c.id),
      });

      const stale = new Set(plan.staleCatalogs);
      const gone = new Set(plan.toDelete);
      // Прогрес стертих курсів лишається: deleteCourse торкається лише кешу дерева.
      await Promise.all([
        ...plan.staleCatalogs.map((id) => db.deleteCatalog(id)),
        ...plan.toDelete.map((id) => db.deleteCourse(id)),
      ]);
      set({
        catalogs: Object.fromEntries(Object.entries(get().catalogs).filter(([id]) => !stale.has(id))),
        courses: get().courses.filter((c) => !gone.has(c.id)),
      });

      const queue = [...plan.toScan];
      const worker = async (): Promise<void> => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) await scanOne(id);
      };
      await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, worker));
    }

    let lastRefreshAt = -Infinity;

    async function runPass(refresh: boolean): Promise<void> {
      if (refresh) {
        // До першого await: syncFromRemote, викликаний одразу після, мусить бачити, що опитування вже йде.
        lastRefreshAt = now();
        await Promise.all(activeCatalogIds(get().library, builtinCatalogId).map(refreshCatalog));
      }
      await applyPlan();
    }

    let running: Promise<void> | null = null;
    let pending: { refresh: boolean } | null = null;

    /**
     * Один прохід за раз. Запит, що прийшов під час проходу, не губиться й не
     * запускає паралельний: виконується одразу після поточного, а кілька таких
     * запитів злипаються в один. Прохід, що впав, не зупиняє черги.
     */
    function schedule(refresh: boolean): Promise<void> {
      pending = { refresh: refresh || (pending?.refresh ?? false) };
      running ??= (async () => {
        try {
          while (pending) {
            const job = pending;
            pending = null;
            await runPass(job.refresh).catch(() => {});
          }
        } finally {
          running = null;
        }
      })();
      return running;
    }

    async function syncProgress(): Promise<void> {
      try {
        const synced = await sync.syncNow();
        // Зливаємо, а не замінюємо: інакше результат синку, що з якоїсь причини не
        // містить локальних записів, тихо знищив би історію перегляду. Поточний
        // стан іде першим — при однаковому updatedAt перемагає цей пристрій.
        set({ progress: mergeProgress(get().progress, synced) });
      } catch {
        // Мережі може не бути — це нормальний стан, не помилка застосунку.
      }
    }

    async function syncLibrary(): Promise<void> {
      let changed = false;
      try {
        const synced = await librarySync.syncNow();
        const before = get().library;
        // Так само зливаємо, а не замінюємо: локальна зміна могла приїхати, поки синк ходив у мережу.
        const merged = mergeLibrary(before, synced);
        changed = !sameLibrary(before, merged);
        set({ library: merged });
      } catch {
        // Офлайн: працюємо з локальною бібліотекою.
      }
      // Каталог, доданий на іншому пристрої, опитуємо одразу; інакше — не частіше за інтервал.
      if (changed || now() - lastRefreshAt >= CATALOG_REFRESH_MS) void schedule(true);
    }

    /** Курс із цим id уже є в активному каталозі — повертає знімок цього каталогу. */
    function catalogHolding(courseId: string): CatalogSnapshot | undefined {
      return activeCatalogIds(get().library, builtinCatalogId)
        .map((id) => get().catalogs[id])
        .find((snapshot) => snapshot?.courses.some((c) => c.id === courseId));
    }

    function assertCanAddCatalog(id: string): void {
      if (id === builtinCatalogId || activeSubscription(id)?.kind === 'catalog') {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }
      if (activeSubscription(id)?.kind === 'course') {
        throw new Error('Ця папка вже додана як курс.');
      }
    }

    return {
      courses: [],
      progress: {},
      library: {},
      catalogs: {},
      catalogStatus: {},
      courseStatus: {},
      builtinCatalogId,
      ready: false,

      async init() {
        const [courses, progress, library, catalogs] = await Promise.all([
          db.getCourses(),
          db.getProgress(),
          db.getLibrary(),
          db.getCatalogs(),
        ]);
        set({
          courses,
          progress,
          library,
          catalogs: Object.fromEntries(catalogs.map((c) => [c.id, c])),
        });

        // Каталоги опитуються у фоні: перше сканування — хвилини запитів, а кеш уже можна показувати.
        void schedule(true);

        // Синхронізація — покращення, а не умова запуску: офлайн застосунок мусить працювати.
        await get().syncFromRemote();

        set({ ready: true });
      },

      reconcile: () => schedule(true),

      whenIdle: () => running ?? Promise.resolve(),

      async syncFromRemote() {
        await Promise.all([syncProgress(), syncLibrary()]);
      },

      async flushSync() {
        // flush сам ковтає помилки: дані вже в IndexedDB.
        await Promise.all([sync.flush(), librarySync.flush()]);
      },

      async previewCatalog(input) {
        const id = parseFolderId(input);
        if (!id) throw new Error('Потрібне посилання на папку Google Drive або її ID');
        assertCanAddCatalog(id);

        const [folder, files] = await Promise.all([api.getFile(id), api.listFolder(id)]).catch(
          rethrowFriendly,
        );
        return { id, title: folder.name, courses: catalogEntries(files) };
      },

      async addCatalog(preview) {
        assertCanAddCatalog(preview.id);
        if (preview.courses.length === 0) throw new Error('У папці немає курсів-підпапок.');

        const snapshot: CatalogSnapshot = { ...preview, lastSyncedAt: now() };
        // Знімок і підписка — в одному синхронному блоці: прохід reconcile, що побачив би
        // знімок без підписки, стер би його як застарілий.
        set({ catalogs: { ...get().catalogs, [preview.id]: snapshot } });
        const write = writeSubscription(preview.id, {
          kind: 'catalog',
          title: preview.title,
          addedAt: now(),
          removed: false,
        });
        await Promise.all([db.putCatalog(snapshot), write]);
        void schedule(false);
      },

      async removeCatalog(id) {
        const sub = activeSubscription(id);
        if (!sub || sub.kind !== 'catalog') return;
        // Курси каталогу зникнуть з кешу в наступному проході; прогрес лишається.
        await writeSubscription(id, { ...sub, removed: true });
        void schedule(false);
      },

      async addCourse(input) {
        const folderId = parseFolderId(input);
        if (!folderId) {
          throw new Error('Потрібне посилання на папку Google Drive або її ID');
        }
        if (folderId === builtinCatalogId || activeSubscription(folderId)?.kind === 'catalog') {
          throw new Error('Ця папка вже додана як каталог.');
        }
        const holder = catalogHolding(folderId);
        if (holder) {
          throw new Error(`Цей курс уже є в каталозі «${holder.title || 'Каталог'}».`);
        }

        const course = await scanCourse(api, folderId, now()).catch(rethrowFriendly);
        const previous = activeSubscription(folderId);

        // Курс і підписка — в одному синхронному блоці: прохід reconcile, що побачив би
        // курс без підписки, стер би його з кешу.
        set({ courses: [...get().courses.filter((c) => c.id !== course.id), course] });
        const write = writeSubscription(folderId, {
          kind: 'course',
          title: course.title,
          addedAt: previous?.addedAt ?? now(),
          removed: false,
        });
        await Promise.all([db.putCourse(course), write]);
        setCourseStatus(folderId, null);
        return course;
      },

      async removeCourse(id) {
        const sub = activeSubscription(id);
        if (!sub || sub.kind !== 'course') return;
        // Прогрес не чіпаємо: це єдині дані, які нізвідки не відновити.
        await writeSubscription(id, { ...sub, removed: true });
        void schedule(false);
      },

      async rescanCourse(id) {
        const existing = get().courses.find((c) => c.id === id);
        // Rescan теж падає, коли права на папку змінилися — і так само мусить
        // казати про це людською мовою: цю помилку показує CoursePage.
        const scanned = await scanCourse(api, id, now()).catch(rethrowFriendly);
        await putCourse({ ...scanned, addedAt: existing?.addedAt ?? scanned.addedAt });
      },

      async setPosition(fileId, positionSec, durationSec) {
        await writeRecord(fileId, (previous) => ({
          positionSec,
          // Тривалість, яку вже знаємо, не затираємо новим null.
          durationSec: durationSec ?? previous?.durationSec ?? null,
          completed: previous?.completed ?? false,
          updatedAt: now(),
        }));
      },

      async setCompleted(fileId, completed) {
        await writeRecord(fileId, (previous) => ({
          positionSec: previous?.positionSec ?? 0,
          durationSec: previous?.durationSec ?? null,
          completed,
          updatedAt: now(),
        }));
      },
    };
  });
}
