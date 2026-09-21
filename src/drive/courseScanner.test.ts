import { describe, expect, it, vi } from 'vitest';
import { scanCourse } from './courseScanner';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { DriveApi, DriveFile } from './api';
import type { FolderNode, TreeNode } from '../types';

function fakeApi(listing: Record<string, DriveFile[]> = COURSE_LISTING): DriveApi {
  return {
    listFolder: vi.fn(async (id: string) => listing[id] ?? []),
    getFile: vi.fn(async () => ROOT_FILE),
    statAppData: vi.fn(async () => null),
    readAppData: vi.fn(async () => null),
    writeAppData: vi.fn(async () => ({ modifiedTime: '' })),
  };
}

const titles = (node: FolderNode): string[] => node.children.map((c) => c.title);
const child = (node: FolderNode, index: number): TreeNode => node.children[index]!;
const asFolder = (node: TreeNode): FolderNode => {
  if (node.kind !== 'folder') throw new Error(`очікувалася папка, отримано ${node.kind}`);
  return node;
};

describe('scanCourse', () => {
  it('бере назву курсу з назви кореневої папки', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    expect(course.title).toBe('Product Management Course');
    expect(course.id).toBe(ROOT_ID);
  });

  it('сортує модулі natural sort', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    expect(titles(course.tree)).toEqual([
      '01 - Feature Opportunity Validation',
      '02 - Feature Design',
    ]);
  });

  it('ставить розділ 10 після розділу 2, а не між 1 і 2', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const module1 = asFolder(child(course.tree, 0));
    expect(titles(module1)).toEqual([
      '1 - Refine Business Value',
      '2 - Validate & Communicate Opportunity',
      '10 - Пізній розділ',
    ]);
  });

  it('відкидає .DS_Store та інші не-відео файли', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const all: string[] = [];
    const walk = (n: TreeNode) => {
      all.push(n.title);
      if (n.kind === 'folder') n.children.forEach(walk);
    };
    walk(course.tree);
    expect(all).not.toContain('.DS_Store');
  });

  it('прибирає папки, що стали порожніми після фільтрації', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    // 03 містить лише підпапку з одним .DS_Store, тому зникає цілком —
    // разом із підпапкою, а не лишається порожнім розділом.
    expect(titles(course.tree)).not.toContain('03 - Порожній модуль');
  });

  it('переносить тривалість відео у дерево', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const section = asFolder(child(asFolder(child(course.tree, 0)), 0));
    const video = child(section, 0);
    expect(video).toMatchObject({ kind: 'video', title: 'Estimating Business Value.mp4' });
    expect(video.kind === 'video' && video.durationSec).toBe(900);
  });

  it('зберігає null для відео без тривалості', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const late = asFolder(child(asFolder(child(course.tree, 0)), 2));
    const video = child(late, 0);
    expect(video.kind === 'video' && video.durationSec).toBeNull();
  });

  it('пише lastScannedAt із переданого часу', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID, 1_700_000_000_000);
    expect(course.lastScannedAt).toBe(1_700_000_000_000);
    expect(course.addedAt).toBe(1_700_000_000_000);
  });

  it('на курсі без жодного відео віддає порожнє дерево, а не падає', async () => {
    const api = fakeApi({ [ROOT_ID]: [] });
    const course = await scanCourse(api, ROOT_ID);
    expect(course.tree.children).toEqual([]);
  });

  it('не зациклюється на папці, що містить себе', async () => {
    // Ярлики Drive теоретично дозволяють цикл; сканер має впертися в межу глибини.
    const api = fakeApi({
      [ROOT_ID]: [
        { id: 'loop', name: 'Петля', mimeType: 'application/vnd.google-apps.folder', trashed: false, durationSec: null },
      ],
      loop: [
        { id: 'loop', name: 'Петля', mimeType: 'application/vnd.google-apps.folder', trashed: false, durationSec: null },
      ],
    });
    await expect(scanCourse(api, ROOT_ID)).resolves.toBeDefined();
  });
});
