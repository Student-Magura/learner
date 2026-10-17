import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';

export const SYNC_DEBOUNCE_MS = 10_000;

export type DocSync<T> = {
  /** pull → merge → push за потреби. Повертає злитий документ. */
  syncNow(): Promise<T>;
  scheduleSync(): void;
  /** Негайна синхронізація замість відкладеної. Помилки ковтає: локальні дані вже збережено. */
  flush(): Promise<void>;
};

export type DocSyncOptions<T> = {
  /** Назва файлу в appDataFolder. */
  file: string;
  /** Файл у Drive — недовірений: parse відкидає биті записи поштучно. */
  parse(content: unknown): T;
  merge(local: T, remote: T): T;
  same(a: T, b: T): boolean;
  empty(): T;
  readLocal(): Promise<T>;
  /** Злиття з ПОТОЧНИМ вмістом сховища в одній транзакції; повертає результат. */
  mergeIntoLocal(doc: T): Promise<T>;
  /** Ключі в meta: час останнього баченого файлу й знімок останнього пушу. */
  metaKeys: { remoteModified: string; pushed: string };
  debounceMs?: number;
};

/**
 * Синхронізує один JSON-документ між IndexedDB і appDataFolder.
 * Прогрес і бібліотека — два екземпляри з різними файлами й ключами meta.
 */
export function createDocSync<T>(
  db: Pick<LearnerDb, 'getMeta' | 'setMeta'>,
  api: Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>,
  options: DocSyncOptions<T>,
): DocSync<T> {
  const { file, metaKeys } = options;
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<T> | null = null;
  let rerun: Promise<T> | null = null;

  async function run(): Promise<T> {
    // Незалежні читання запускаємо паралельно.
    const [local, stat, lastSeen, pushed] = await Promise.all([
      options.readLocal(),
      api.statAppData(file),
      db.getMeta<string>(metaKeys.remoteModified),
      db.getMeta<T>(metaKeys.pushed),
    ]);

    // Файл не змінився з нашого останнього злиття — тягнути його немає сенсу.
    const remoteChanged = stat !== null && stat.modifiedTime !== lastSeen;

    let remote = options.empty();
    if (remoteChanged) {
      const payload = await api.readAppData(file);
      remote = options.parse(payload?.content);
    }

    // `local` — знімок, зроблений ДО мережевих походів вище. За цей час
    // користувач міг щось змінити, тому остаточне злиття робиться проти
    // поточного вмісту сховища, в одній транзакції з записом: інакше запис,
    // що приїхав у вікно очікування, зник би зі сховища назавжди.
    const merged = await options.mergeIntoLocal(options.merge(local, remote));

    // Пушимо, якщо те, що ми надіслали б, відрізняється від того, що ми надсилали
    // востаннє — а не лише тоді, коли ІНШИЙ пристрій щось змінив: локальний стан
    // теж міг просунутися відтоді.
    const mustPush = stat === null || !options.same(merged, pushed ?? options.empty());
    if (mustPush) {
      const { modifiedTime } = await api.writeAppData(file, merged);
      await db.setMeta(metaKeys.remoteModified, modifiedTime);
      await db.setMeta(metaKeys.pushed, merged);
    } else if (stat !== null) {
      await db.setMeta(metaKeys.remoteModified, stat.modifiedTime);
    }

    return merged;
  }

  function syncNow(): Promise<T> {
    // Один прохід за раз: паралельні злиття могли б перезаписати одне одного.
    if (running) {
      // Запис міг приїхати вже після злиття поточного проходу — він його не
      // запушить. Тому просимо ще один прохід; кілька прохань злипаються в одне.
      const next = () => {
        rerun = null;
        return running ?? startRun();
      };
      rerun ??= running.then(next, next);
      return rerun;
    }
    return startRun();
  }

  function startRun(): Promise<T> {
    const current = run().finally(() => {
      if (running === current) running = null;
    });
    running = current;
    return current;
  }

  return {
    syncNow,

    scheduleSync() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // Мережа може бути відсутня — це нормальний стан, не помилка застосунку.
        void syncNow().catch(() => {});
      }, debounceMs);
    },

    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        await syncNow();
      } catch {
        // Дані вже в IndexedDB; злиття відбудеться при наступному запуску.
      }
    },
  };
}
