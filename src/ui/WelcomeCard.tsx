import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'learner-welcome-dismissed';

const listeners = new Set<() => void>();
/** Приватний режим без localStorage: закриття живе до перезавантаження. */
let dismissedInMemory = false;

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return dismissedInMemory;
  }
}

function setDismissed(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    dismissedInMemory = dismissed;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Кнопка «?» у шапці знову відкриває картку, яку закрили надто поспіхом. */
export function showWelcome() {
  setDismissed(false);
}

/** Схема папки моноширинним текстом: уся суть «курс чи каталог» — у структурі. */
function FolderTree({ lines }: { lines: string[] }) {
  return (
    <pre aria-hidden className="mt-2 overflow-x-auto bg-bg px-3 py-2 font-mono text-xs leading-relaxed">
      {lines.join('\n')}
    </pre>
  );
}

/**
 * Пояснення для новачка, якому скинули посилання: що це за інструмент і що сюди можна
 * додати власні папки. Закриття памʼятається лише на цьому пристрої — свідомо.
 */
export function WelcomeCard() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed);
  if (dismissed) return null;

  return (
    <section
      aria-labelledby="welcome-heading"
      className="relative flex flex-col gap-4 border-2 border-rule bg-surface p-6 sm:p-8"
    >
      <h2 id="welcome-heading" className="sr-only">
        Як працює Learner
      </h2>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Закрити пояснення"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-xl text-muted hover:bg-soft hover:text-fg"
      >
        ✕
      </button>
      <p className="pr-10 text-lg font-bold leading-snug">
        Learner показує відеокурси з Google Drive і памʼятає, де ви зупинились.
      </p>
      <p className="text-muted">
        Курси нижче вже доступні — просто відкрийте потрібний. А ще сюди можна додати власні
        папки з Drive:
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p>
            <span className="font-bold">+ Курс</span> — одна папка з відео, можна з
            підпапками-розділами.
          </p>
          <FolderTree
            lines={['📁 Python для аналітиків', ' ├ 📁 01 Вступ', ' │  └ 🎬 01 Знайомство.mp4', ' └ 📁 02 Основи']}
          />
        </div>
        <div>
          <p>
            <span className="font-bold">+ Каталог</span> — папка, де кожна підпапка — окремий
            курс. Нові курси, які туди викладуть, зʼявлятимуться самі.
          </p>
          <FolderTree lines={['📁 Курси нашої команди', ' ├ 📁 Python для аналітиків', ' ├ 📁 SQL з нуля', ' └ 📁 …']} />
        </div>
      </div>
    </section>
  );
}
