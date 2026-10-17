import { describe, expect, it } from 'vitest';
import { buildSections } from './sections';
import type { CatalogSection, SectionsInput } from './sections';
import type { CatalogSnapshot, Course, Subscription } from '../types';

function course(id: string, title = id): Course {
  return { id, title, addedAt: 1, lastScannedAt: 1, tree: { id, kind: 'folder', title, children: [] } };
}

function sub(kind: Subscription['kind'], addedAt = 1, over: Partial<Subscription> = {}): Subscription {
  return { kind, title: `Підписка ${addedAt}`, addedAt, updatedAt: addedAt, removed: false, ...over };
}

function snap(id: string, title: string, entries: [string, string][]): CatalogSnapshot {
  return { id, title, courses: entries.map(([cid, t]) => ({ id: cid, title: t })), lastSyncedAt: 1 };
}

function input(over: Partial<SectionsInput> = {}): SectionsInput {
  return {
    library: {},
    builtinCatalogId: undefined,
    catalogs: {},
    courses: [],
    catalogStatus: {},
    courseStatus: {},
    ...over,
  };
}

const catalogAt = (sections: ReturnType<typeof buildSections>, i: number) =>
  sections[i] as CatalogSection;

describe('buildSections', () => {
  it('порожня бібліотека — жодної секції', () => {
    expect(buildSections(input())).toEqual([]);
  });

  it('порядок: вбудований, додані за addedAt, власні', () => {
    const sections = buildSections(
      input({
        builtinCatalogId: 'z',
        library: { b: sub('catalog', 2), a: sub('catalog', 1), own: sub('course', 0) },
        catalogs: { z: snap('z', 'Каталог 2 РІЦ', [['c1', 'Курс']]) },
      }),
    );
    expect(sections.map((s) => (s.kind === 'catalog' ? s.id : 'own'))).toEqual([
      'z',
      'a',
      'b',
      'own',
    ]);
    expect(catalogAt(sections, 0).builtin).toBe(true);
    expect(catalogAt(sections, 1).builtin).toBe(false);
  });

  it('вбудований каталог без курсів і без активності не показується', () => {
    expect(buildSections(input({ builtinCatalogId: 'z' }))).toEqual([]);
  });

  it('вбудований каталог показується, поки його вперше опитують', () => {
    const sections = buildSections(input({ builtinCatalogId: 'z', catalogStatus: { z: 'syncing' } }));
    expect(catalogAt(sections, 0)).toMatchObject({ id: 'z', title: 'Каталог', busy: true });
  });

  it('доданий каталог показується й порожнім — з назвою з підписки', () => {
    const sections = buildSections(
      input({ library: { k: sub('catalog', 1, { title: 'Команда дизайну' }) } }),
    );
    expect(catalogAt(sections, 0)).toMatchObject({ id: 'k', title: 'Команда дизайну', slots: [] });
  });

  it('назва зі знімка має перевагу над назвою з підписки', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog', 1, { title: 'Стара' }) },
        catalogs: { k: snap('k', 'Нова', []) },
      }),
    );
    expect(catalogAt(sections, 0).title).toBe('Нова');
  });

  it('курси каталогу — природним порядком', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c10', '10 - Пізній'], ['c2', '2 - Ранній']]) },
      }),
    );
    const titles = catalogAt(sections, 0).slots.map((s) =>
      s.kind === 'pending' ? s.title : s.course.title,
    );
    expect(titles).toEqual(['2 - Ранній', '10 - Пізній']);
  });

  it('відсканований курс — ready, невідсканований — pending зі статусом', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c1', 'Один'], ['c2', 'Два'], ['c3', 'Три']]) },
        courses: [course('c1', 'Один')],
        courseStatus: { c2: 'scanning' },
      }),
    );
    const section = catalogAt(sections, 0);
    // Natural sort за назвою: «Два», «Один», «Три».
    expect(section.slots).toEqual([
      { kind: 'pending', id: 'c2', title: 'Два', status: 'scanning' },
      { kind: 'ready', course: course('c1', 'Один') },
      { kind: 'pending', id: 'c3', title: 'Три', status: null },
    ]);
    expect(section.ready).toBe(1);
    expect(section.busy).toBe(true);
  });

  it('без сканування й опитування каталог не зайнятий', () => {
    const sections = buildSections(
      input({
        library: { k: sub('catalog') },
        catalogs: { k: snap('k', 'K', [['c1', 'Один']]) },
        courses: [course('c1')],
      }),
    );
    expect(catalogAt(sections, 0).busy).toBe(false);
  });

  it('статус «немає доступу» до каталогу доходить до секції', () => {
    const sections = buildSections(
      input({ library: { k: sub('catalog') }, catalogStatus: { k: 'no-access' } }),
    );
    expect(catalogAt(sections, 0).status).toBe('no-access');
  });

  it('власні — за addedAt; прибраний не показується; невідсканований має назву з підписки', () => {
    const sections = buildSections(
      input({
        library: {
          b: sub('course', 2, { title: 'Бе' }),
          a: sub('course', 1, { title: 'А' }),
          gone: sub('course', 0, { removed: true }),
        },
        courses: [course('a', 'А')],
      }),
    );
    expect(sections).toEqual([
      {
        kind: 'own',
        slots: [
          { kind: 'ready', course: course('a', 'А') },
          { kind: 'pending', id: 'b', title: 'Бе', status: null },
        ],
      },
    ]);
  });

  it('той самий курс у двох каталогах — в обох секціях', () => {
    const sections = buildSections(
      input({
        library: { k1: sub('catalog', 1), k2: sub('catalog', 2) },
        catalogs: { k1: snap('k1', 'K1', [['c1', 'Спільний']]), k2: snap('k2', 'K2', [['c1', 'Спільний']]) },
        courses: [course('c1', 'Спільний')],
      }),
    );
    expect(sections.map((s) => s.slots.length)).toEqual([1, 1]);
  });
});
