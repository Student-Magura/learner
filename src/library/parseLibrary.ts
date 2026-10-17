import type { Library, Subscription } from '../types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function toSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    (r.kind !== 'catalog' && r.kind !== 'course') ||
    typeof r.title !== 'string' ||
    !isFiniteNumber(r.addedAt) ||
    !isFiniteNumber(r.updatedAt) ||
    typeof r.removed !== 'boolean'
  ) {
    return null;
  }
  // Збираємо заново, а не повертаємо як є: зайві поля з чужого файлу не мусять осідати в IndexedDB.
  return { kind: r.kind, title: r.title, addedAt: r.addedAt, updatedAt: r.updatedAt, removed: r.removed };
}

/**
 * Файл бібліотеки в Drive міг записати інший пристрій зі старішою чи новішою
 * версією застосунку. Зламані записи відкидаємо поштучно, щоб не втратити решту.
 */
export function parseLibrary(content: unknown): Library {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return {};
  const out: Library = {};
  for (const [id, value] of Object.entries(content as Record<string, unknown>)) {
    const sub = toSubscription(value);
    if (sub) out[id] = sub;
  }
  return out;
}
