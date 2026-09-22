import { useCallback, useState } from 'react';

export const CAPABILITY_STORAGE_KEY = 'learner.mediaCapability';

export type MediaCapability = 'proxy' | 'fallback';

/**
 * Маршрут, який перехоплює Service Worker і проксує в Drive.
 *
 * Мусить лежати всередині scope воркера (BASE_URL), інакше запит піде повз
 * нього напряму на статичний сервер і мовчки провалиться 404-кою. Ця
 * функція і MEDIA_PREFIX у src/sw/service-worker.ts мусять погоджуватись —
 * обидві виводять префікс з базового шляху застосунку, а не з літералу.
 */
export function mediaUrl(fileId: string): string {
  return `${import.meta.env.BASE_URL}media/${fileId}`;
}

export function detectInitialCapability(
  hasServiceWorker: boolean,
  stored: string | null,
): MediaCapability {
  if (!hasServiceWorker) return 'fallback';
  return stored === 'fallback' ? 'fallback' : 'proxy';
}

function readStored(): string | null {
  // Приватний режим може кидати на доступі до localStorage.
  try {
    return localStorage.getItem(CAPABILITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Вердикт визначається на живому файлі: плеєр повідомляє про провал, і ми
 * запамʼятовуємо fallback, щоб не мучити користувача паузою на кожному уроці.
 */
export function useMediaCapability(): {
  capability: MediaCapability;
  markProxyUnsupported(): void;
  retryProxy(): void;
} {
  const [capability, setCapability] = useState<MediaCapability>(() =>
    detectInitialCapability('serviceWorker' in navigator, readStored()),
  );

  const markProxyUnsupported = useCallback(() => {
    setCapability('fallback');
    try {
      localStorage.setItem(CAPABILITY_STORAGE_KEY, 'fallback');
    } catch {
      // Вердикт лишиться в памʼяті на цю сесію — цього достатньо.
    }
  }, []);

  /**
   * Вердикт міг зʼявитися через тимчасову причину — офлайн, 5xx від Drive,
   * протермінований токен у воркері. Без цього виходу капабельний браузер
   * лишався б на ручних відмітках назавжди: вердикт не чистив ніхто.
   */
  const retryProxy = useCallback(() => {
    try {
      localStorage.removeItem(CAPABILITY_STORAGE_KEY);
    } catch {
      // Немає сховища — немає і збереженого вердикту, скидати нічого.
    }
    setCapability(detectInitialCapability('serviceWorker' in navigator, null));
  }, []);

  return { capability, markProxyUnsupported, retryProxy };
}
