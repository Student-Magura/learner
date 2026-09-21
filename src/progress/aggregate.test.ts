import { describe, expect, it } from 'vitest';
import {
  aggregate,
  effectiveDuration,
  findResumeVideoId,
  flattenVideos,
  shouldAutoComplete,
} from './aggregate';
import type { Course, FolderNode, ProgressMap, ProgressRecord, VideoNode } from '../types';

function video(id: string, durationSec: number | null): VideoNode {
  return { id, kind: 'video', title: id, durationSec };
}

function folder(id: string, children: FolderNode['children']): FolderNode {
  return { id, kind: 'folder', title: id, children };
}

function rec(over: Partial<ProgressRecord> = {}): ProgressRecord {
  return { positionSec: 0, durationSec: null, completed: false, updatedAt: 1, ...over };
}

describe('flattenVideos', () => {
  it('віддає відео в порядку курсу, обходячи дерево в глибину', () => {
    const tree = folder('root', [
      folder('m1', [video('a', 10), video('b', 10)]),
      folder('m2', [folder('s1', [video('c', 10)])]),
    ]);
    expect(flattenVideos(tree).map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('на порожньому дереві віддає порожній масив', () => {
    expect(flattenVideos(folder('root', []))).toEqual([]);
  });
});

describe('effectiveDuration', () => {
  it('бере тривалість із дерева, коли вона там є', () => {
    expect(effectiveDuration(video('a', 120), {})).toBe(120);
  });

  it('падає на тривалість із прогресу, коли в дереві її немає', () => {
    const progress: ProgressMap = { a: rec({ durationSec: 90 }) };
    expect(effectiveDuration(video('a', null), progress)).toBe(90);
  });

  it('віддає null, коли тривалість невідома з обох джерел', () => {
    expect(effectiveDuration(video('a', null), { a: rec() })).toBeNull();
  });
});

describe('aggregate — окреме відео', () => {
  it('без прогресу дає 0', () => {
    expect(aggregate(video('a', 100), {})).toEqual({
      ratio: 0,
      approximate: false,
      videoCount: 1,
      completedCount: 0,
    });
  });

  it('рахує частковий перегляд за часом', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 25 }) };
    expect(aggregate(video('a', 100), progress).ratio).toBeCloseTo(0.25);
  });

  it('позначене переглянутим дає рівно 1, навіть якщо позиція менша', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 10, completed: true }) };
    expect(aggregate(video('a', 100), progress).ratio).toBe(1);
  });

  it('не дає більше 1, якщо позиція перевищила тривалість', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 150 }) };
    expect(aggregate(video('a', 100), progress).ratio).toBe(1);
  });

  it('відео з невідомою тривалістю рахується за фактом завершення й позначається приблизним', () => {
    expect(aggregate(video('a', null), {})).toEqual({
      ratio: 0,
      approximate: true,
      videoCount: 1,
      completedCount: 0,
    });
    const done: ProgressMap = { a: rec({ completed: true }) };
    expect(aggregate(video('a', null), done)).toEqual({
      ratio: 1,
      approximate: true,
      videoCount: 1,
      completedCount: 1,
    });
  });
});

describe('aggregate — папка', () => {
  it('зважує відео за тривалістю, а не за кількістю', () => {
    // 100 с переглянуто повністю + 900 с не почато = 10% курсу, не 50%.
    const tree = folder('root', [video('short', 100), video('long', 900)]);
    const progress: ProgressMap = { short: rec({ completed: true }) };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBeCloseTo(0.1);
    expect(result.approximate).toBe(false);
    expect(result.completedCount).toBe(1);
    expect(result.videoCount).toBe(2);
  });

  it('агрегує через кілька рівнів вкладеності', () => {
    const tree = folder('root', [
      folder('m1', [folder('s1', [video('a', 100)]), video('b', 100)]),
      folder('m2', [video('c', 200)]),
    ]);
    const progress: ProgressMap = { a: rec({ completed: true }), c: rec({ positionSec: 100 }) };
    // (100 + 0 + 100) / 400 = 0.5
    expect(aggregate(tree, progress).ratio).toBeCloseTo(0.5);
  });

  it('виключає відео з невідомою тривалістю з обох боків дробу', () => {
    // Якби переглянуте «unknown» додавалося лише в чисельник, вийшло б понад 100%.
    const tree = folder('root', [video('known', 100), video('unknown', null)]);
    const progress: ProgressMap = {
      known: rec({ completed: true }),
      unknown: rec({ completed: true }),
    };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBe(1);
    expect(result.ratio).toBeLessThanOrEqual(1);
    expect(result.approximate).toBe(false);
    expect(result.completedCount).toBe(2);
  });

  it('падає на підрахунок за кількістю, коли жодне відео не має тривалості', () => {
    const tree = folder('root', [video('a', null), video('b', null), video('c', null)]);
    const progress: ProgressMap = { a: rec({ completed: true }) };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBeCloseTo(1 / 3);
    expect(result.approximate).toBe(true);
  });

  it('порожня папка дає 0 і не вважається приблизною', () => {
    expect(aggregate(folder('root', []), {})).toEqual({
      ratio: 0,
      approximate: false,
      videoCount: 0,
      completedCount: 0,
    });
  });
});

describe('shouldAutoComplete', () => {
  it('спрацьовує на 90% тривалості', () => {
    expect(shouldAutoComplete(90, 100)).toBe(true);
    expect(shouldAutoComplete(89.9, 100)).toBe(false);
  });

  it('не спрацьовує без відомої тривалості', () => {
    expect(shouldAutoComplete(9999, null)).toBe(false);
  });

  it('не спрацьовує при нульовій тривалості', () => {
    expect(shouldAutoComplete(0, 0)).toBe(false);
  });
});

describe('findResumeVideoId', () => {
  const tree = folder('root', [video('a', 100), video('b', 100), video('c', 100)]);
  const course: Course = { id: 'root', title: 'К', addedAt: 0, tree, lastScannedAt: 0 };

  it('на новому курсі віддає перше відео', () => {
    expect(findResumeVideoId(course, {})).toBe('a');
  });

  it('віддає відео з найсвіжішим updatedAt, якщо воно не завершене', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 500, positionSec: 30 }),
    };
    expect(findResumeVideoId(course, progress)).toBe('b');
  });

  it('після завершеного віддає наступне незавершене', () => {
    const progress: ProgressMap = { a: rec({ updatedAt: 500, completed: true }) };
    expect(findResumeVideoId(course, progress)).toBe('b');
  });

  it('пропускає вже завершені при пошуку наступного', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 500, completed: true }),
    };
    expect(findResumeVideoId(course, progress)).toBe('c');
  });

  it('на повністю пройденому курсі віддає останнє переглянуте', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 200, completed: true }),
      c: rec({ updatedAt: 300, completed: true }),
    };
    expect(findResumeVideoId(course, progress)).toBe('c');
  });

  it('на курсі без відео віддає null', () => {
    const empty: Course = { ...course, tree: folder('root', []) };
    expect(findResumeVideoId(empty, {})).toBeNull();
  });
});
