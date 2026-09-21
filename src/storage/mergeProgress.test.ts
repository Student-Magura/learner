import { describe, expect, it } from 'vitest';
import { mergeProgress } from './mergeProgress';
import type { ProgressMap, ProgressRecord } from '../types';

function rec(updatedAt: number, positionSec: number): ProgressRecord {
  return { positionSec, durationSec: 100, completed: false, updatedAt };
}

describe('mergeProgress', () => {
  it('на двох порожніх мапах дає порожню', () => {
    expect(mergeProgress({}, {})).toEqual({});
  });

  it('бере локальний запис, коли він свіжіший', () => {
    const local: ProgressMap = { a: rec(200, 50) };
    const remote: ProgressMap = { a: rec(100, 10) };
    expect(mergeProgress(local, remote).a).toEqual(rec(200, 50));
  });

  it('бере віддалений запис, коли він свіжіший', () => {
    const local: ProgressMap = { a: rec(100, 10) };
    const remote: ProgressMap = { a: rec(300, 80) };
    expect(mergeProgress(local, remote).a).toEqual(rec(300, 80));
  });

  it('при однакових updatedAt лишає локальний — детерміновано', () => {
    const local: ProgressMap = { a: rec(100, 50) };
    const remote: ProgressMap = { a: rec(100, 10) };
    expect(mergeProgress(local, remote).a?.positionSec).toBe(50);
  });

  it('зберігає записи, відсутні з одного боку', () => {
    const local: ProgressMap = { onlyLocal: rec(1, 1) };
    const remote: ProgressMap = { onlyRemote: rec(1, 2) };
    const merged = mergeProgress(local, remote);
    expect(Object.keys(merged).sort()).toEqual(['onlyLocal', 'onlyRemote']);
  });

  it('вирішує конфлікт для кожного відео окремо, а не для мапи цілком', () => {
    // Це головна властивість: телефон випередив по «a», ноутбук — по «b».
    const local: ProgressMap = { a: rec(500, 90), b: rec(100, 5) };
    const remote: ProgressMap = { a: rec(100, 5), b: rec(500, 90) };
    const merged = mergeProgress(local, remote);
    expect(merged.a?.positionSec).toBe(90);
    expect(merged.b?.positionSec).toBe(90);
  });

  it('не мутує вхідні мапи', () => {
    const local: ProgressMap = { a: rec(100, 10) };
    const remote: ProgressMap = { b: rec(100, 20) };
    mergeProgress(local, remote);
    expect(Object.keys(local)).toEqual(['a']);
    expect(Object.keys(remote)).toEqual(['b']);
  });
});
