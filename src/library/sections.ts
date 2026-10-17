import { naturalCompare } from '../drive/naturalSort';
import { activeCatalogIds, ownCourseIds } from './reconcile';
import type { CatalogSnapshot, Course, Library } from '../types';

export type CatalogStatus = 'syncing' | 'no-access';
export type CourseStatus = 'scanning' | 'no-access' | 'failed';

/** Картка курсу: або відскановане дерево, або поки лише назва зі знімка чи підписки. */
export type CourseSlot =
  | { kind: 'ready'; course: Course }
  | { kind: 'pending'; id: string; title: string; status: CourseStatus | null };

export type CatalogSection = {
  kind: 'catalog';
  id: string;
  title: string;
  /** Вбудований каталог збірки — підписаний «для всіх» і не прибирається. */
  builtin: boolean;
  status: CatalogStatus | null;
  /** Каталог опитується або якийсь його курс сканується — показуємо «Оновлюємо…». */
  busy: boolean;
  /** Скільки курсів уже відскановано — для «Оновлюємо… 2 з 6». */
  ready: number;
  slots: CourseSlot[];
};

export type OwnSection = { kind: 'own'; slots: CourseSlot[] };

export type Section = CatalogSection | OwnSection;

export type SectionsInput = {
  library: Library;
  builtinCatalogId?: string;
  catalogs: Record<string, CatalogSnapshot>;
  courses: Course[];
  catalogStatus: Record<string, CatalogStatus>;
  courseStatus: Record<string, CourseStatus>;
};

/** Секції не зберігаються — виводяться з підписок, знімків і кешу щоразу заново. */
export function buildSections(input: SectionsInput): Section[] {
  const byId = new Map(input.courses.map((c) => [c.id, c]));
  const slot = (id: string, title: string): CourseSlot => {
    const course = byId.get(id);
    return course
      ? { kind: 'ready', course }
      : { kind: 'pending', id, title, status: input.courseStatus[id] ?? null };
  };

  const sections: Section[] = [];

  for (const id of activeCatalogIds(input.library, input.builtinCatalogId)) {
    const builtin = id === input.builtinCatalogId;
    const snapshot = input.catalogs[id];
    const status = input.catalogStatus[id] ?? null;
    const slots = [...(snapshot?.courses ?? [])]
      .sort((a, b) => naturalCompare(a.title, b.title))
      .map((entry) => slot(entry.id, entry.title));

    // Вбудований каталог без курсів і без активності не показуємо — як і до каталогів користувача.
    if (builtin && slots.length === 0 && status === null) continue;

    sections.push({
      kind: 'catalog',
      id,
      // Після міграції назва вбудованого порожня до першого опитування.
      title: snapshot?.title || input.library[id]?.title || 'Каталог',
      builtin,
      status,
      busy:
        status === 'syncing' ||
        slots.some((s) => s.kind === 'pending' && s.status === 'scanning'),
      ready: slots.filter((s) => s.kind === 'ready').length,
      slots,
    });
  }

  const own = ownCourseIds(input.library).map((id) => slot(id, input.library[id]!.title));
  if (own.length > 0) sections.push({ kind: 'own', slots: own });

  return sections;
}
