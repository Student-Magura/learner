import type { Library, Subscription } from '../types';

/**
 * Зливає підписки per-entry last-write-wins за updatedAt — так само, як mergeProgress.
 * Tombstone — теж запис: свіже «прибрати» перемагає старе «додати», і навпаки.
 * При однакових updatedAt перемагає локальний.
 */
export function mergeLibrary(local: Library, remote: Library): Library {
  const merged: Library = { ...remote };
  for (const [id, sub] of Object.entries(local)) {
    const existing = merged[id];
    if (!existing || sub.updatedAt >= existing.updatedAt) merged[id] = sub;
  }
  return merged;
}

function sameSubscription(a: Subscription, b: Subscription): boolean {
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.addedAt === b.addedAt &&
    a.updatedAt === b.updatedAt &&
    a.removed === b.removed
  );
}

export function sameLibrary(a: Library, b: Library): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const right = b[key];
    return right !== undefined && sameSubscription(a[key]!, right);
  });
}
