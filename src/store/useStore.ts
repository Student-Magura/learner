import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { DriveError } from '../drive/api';
import { scanCourse } from '../drive/courseScanner';
import { parseFolderId } from '../drive/parseFolderUrl';
import { mergeProgress } from '../storage/mergeProgress';
import type { DriveApi } from '../drive/api';
import type { LearnerDb } from '../storage/db';
import type { SyncEngine } from '../storage/syncEngine';
import type { Course, ProgressMap, ProgressRecord } from '../types';

export type StoreDeps = {
  db: LearnerDb;
  api: DriveApi;
  sync: SyncEngine;
  now?: () => number;
};

export type LearnerState = {
  courses: Course[];
  progress: ProgressMap;
  ready: boolean;
  error: string | null;
  init(): Promise<void>;
  addCourse(input: string): Promise<Course>;
  removeCourse(id: string): Promise<void>;
  rescanCourse(id: string): Promise<void>;
  setPosition(fileId: string, positionSec: number, durationSec: number | null): Promise<void>;
  setCompleted(fileId: string, completed: boolean): Promise<void>;
};

export function createLearnerStore(
  deps: StoreDeps,
): UseBoundStore<StoreApi<LearnerState>> {
  const { db, api, sync } = deps;
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

    return {
      courses: [],
      progress: {},
      ready: false,
      error: null,

      async init() {
        const [courses, progress] = await Promise.all([db.getCourses(), db.getProgress()]);
        set({ courses, progress });

        // Синхронізація — покращення, а не умова запуску: офлайн застосунок мусить працювати.
        // Зливаємо, а не замінюємо: інакше результат синку, що з якоїсь причини не містить
        // локальних записів, тихо знищив би історію перегляду.
        try {
          const synced = await sync.syncNow();
          set({ progress: mergeProgress(progress, synced) });
        } catch {
          // Локальні дані вже в стані; злиття відбудеться при наступній нагоді.
        }

        set({ ready: true });
      },

      async addCourse(input) {
        const folderId = parseFolderId(input);
        if (!folderId) {
          throw new Error('Потрібне посилання на папку Google Drive або її ID');
        }

        // «Drive API 404» користувачеві нічого не каже — перекладаємо на людську мову.
        const course = await scanCourse(api, folderId, now()).catch((cause: unknown) => {
          if (cause instanceof DriveError && (cause.status === 404 || cause.status === 403)) {
            throw new Error(
              'Папку не знайдено або до неї немає доступу. Перевірте посилання і те, ' +
                'що папкою поділилися з вашим акаунтом.',
            );
          }
          throw cause;
        });
        await db.putCourse(course);
        set({
          courses: [...get().courses.filter((c) => c.id !== course.id), course],
          error: null,
        });
        return course;
      },

      async removeCourse(id) {
        // Прогрес не чіпаємо: це єдині дані, які нізвідки не відновити.
        await db.deleteCourse(id);
        set({ courses: get().courses.filter((c) => c.id !== id) });
      },

      async rescanCourse(id) {
        const existing = get().courses.find((c) => c.id === id);
        const scanned = await scanCourse(api, id, now());
        const course: Course = { ...scanned, addedAt: existing?.addedAt ?? scanned.addedAt };
        await db.putCourse(course);
        set({ courses: get().courses.map((c) => (c.id === id ? course : c)) });
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
