import { useCallback, useState } from 'react';

export const CAPABILITY_STORAGE_KEY = 'learner.mediaCapability';

export type MediaCapability = 'proxy' | 'fallback';

/** Маршрут, який перехоплює Service Worker і проксує в Drive. */
export function mediaUrl(fileId: string): string {
  return `/media/${fileId}`;
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

  return { capability, markProxyUnsupported };
}
