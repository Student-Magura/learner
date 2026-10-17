import { describe, expect, it } from 'vitest';
import { activeCatalogIds, catalogEntries, ownCourseIds, planReconcile } from './reconcile';
import type { DriveFile } from '../drive/api';
import type { CatalogSnapshot, Library, Subscription } from '../types';

function sub(kind: Subscription['kind'], addedAt = 1, over: Partial<Subscription> = {}): Subscription {
  return { kind, title: 't', addedAt, updatedAt: addedAt, removed: false, ...over };
}

function snap(id: string, courseIds: string[]): CatalogSnapshot {
  return { id, title: id, courses: courseIds.map((c) => ({ id: c, title: c })), lastSyncedAt: 1 };
}

function plan(library: Library, catalogs: CatalogSnapshot[], cached: string[], builtin?: string) {
  return planReconcile({
    library,
    builtinCatalogId: builtin,
    catalogs: Object.fromEntries(catalogs.map((c) => [c.id, c])),
    cachedCourseIds: cached,
  });
}

describe('activeCatalogIds', () => {
  it('вбудований першим, далі додані за addedAt; власні курси не беруться', () => {
    const library = { b: sub('catalog', 2), a: sub('catalog', 1), c: sub('course', 0) };
    expect(activeCatalogIds(library, 'z')).toEqual(['z', 'a', 'b']);
  });

  it('прибрані каталоги не беруться', () => {
    expect(activeCatalogIds({ a: sub('catalog', 1, { removed: true }) })).toEqual([]);
  });

  it('вбудований — рівно один раз, навіть якщо його id є в бібліотеці прибраним', () => {
    expect(activeCatalogIds({ z: sub('catalog', 1, { removed: true }) }, 'z')).toEqual(['z']);
  });
});

describe('ownCourseIds', () => {
  it('активні власні курси за addedAt', () => {
    const library = {
      b: sub('course', 2),
      a: sub('course', 1),
      x: sub('course', 0, { removed: true }),
      k: sub('catalog', 0),
    };
    expect(ownCourseIds(library)).toEqual(['a', 'b']);
  });
});

describe('planReconcile', () => {
  it('курс нового каталогу, якого немає в кеші, іде на скан', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], []).toScan).toEqual(['c1']);
  });

  it('курс у двох каталогах сканується один раз', () => {
    const library = { k1: sub('catalog'), k2: sub('catalog') };
    expect(plan(library, [snap('k1', ['c1']), snap('k2', ['c1'])], []).toScan).toEqual(['c1']);
  });

  it('відомий курс не пересканьовується', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], ['c1']).toScan).toEqual([]);
  });

  it('курс, що зник із каталогу, стирається з кешу', () => {
    expect(plan({ k: sub('catalog') }, [snap('k', ['c1'])], ['c1', 'c2']).toDelete).toEqual(['c2']);
  });

  it('власний курс лишається, хоч його немає в жодному каталозі', () => {
    expect(plan({ own: sub('course') }, [], ['own']).toDelete).toEqual([]);
  });

  it('власний курс без дерева в кеші іде на скан', () => {
    expect(plan({ own: sub('course') }, [], []).toScan).toEqual(['own']);
  });

  it('курс і власний, і в прибраному каталозі лишається', () => {
    const library = { k: sub('catalog', 1, { removed: true }), c1: sub('course') };
    const result = plan(library, [snap('k', ['c1'])], ['c1']);
    expect(result.toDelete).toEqual([]);
    expect(result.staleCatalogs).toEqual(['k']);
  });

  it('курси прибраного каталогу стираються разом із його знімком', () => {
    const library = { k: sub('catalog', 1, { removed: true }) };
    const result = plan(library, [snap('k', ['c1'])], ['c1']);
    expect(result.toDelete).toEqual(['c1']);
    expect(result.staleCatalogs).toEqual(['k']);
  });

  it('знімок вбудованого каталогу не застаріває', () => {
    expect(plan({}, [snap('z', ['c1'])], ['c1'], 'z')).toEqual({
      toScan: [],
      toDelete: [],
      staleCatalogs: [],
    });
  });

  it('активний каталог без знімка нічого не сканує й не стирає', () => {
    expect(plan({ k: sub('catalog') }, [], [])).toEqual({
      toScan: [],
      toDelete: [],
      staleCatalogs: [],
    });
  });
});

describe('catalogEntries', () => {
  const file = (id: string, name: string, over: Partial<DriveFile> = {}): DriveFile => ({
    id,
    name,
    mimeType: 'application/vnd.google-apps.folder',
    trashed: false,
    durationSec: null,
    ...over,
  });

  it('лише видимі папки, природним порядком', () => {
    const entries = catalogEntries([
      file('c10', '10 - Пізній'),
      file('c2', '2 - Ранній'),
      file('mp4', 'промо.mp4', { mimeType: 'video/mp4' }),
      file('hidden', '.archive'),
      file('bin', 'Старе', { trashed: true }),
    ]);
    expect(entries).toEqual([
      { id: 'c2', title: '2 - Ранній' },
      { id: 'c10', title: '10 - Пізній' },
    ]);
  });
});
