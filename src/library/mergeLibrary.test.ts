import { describe, expect, it } from 'vitest';
import { mergeLibrary, sameLibrary } from './mergeLibrary';
import type { Library, Subscription } from '../types';

function sub(updatedAt: number, over: Partial<Subscription> = {}): Subscription {
  return { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt, removed: false, ...over };
}

describe('mergeLibrary', () => {
  it('бере записи, що є лише з одного боку', () => {
    expect(mergeLibrary({ a: sub(1) }, { b: sub(2) })).toEqual({ a: sub(1), b: sub(2) });
  });

  it('свіжіший віддалений запис перемагає', () => {
    const merged = mergeLibrary({ a: sub(1) }, { a: sub(2, { title: 'Нова' }) });
    expect(merged.a?.title).toBe('Нова');
  });

  it('свіжіший локальний запис перемагає', () => {
    const merged = mergeLibrary({ a: sub(3, { title: 'Тут' }) }, { a: sub(2, { title: 'Там' }) });
    expect(merged.a?.title).toBe('Тут');
  });

  it('при однаковому updatedAt лишається локальний', () => {
    const merged = mergeLibrary({ a: sub(5, { title: 'Тут' }) }, { a: sub(5, { title: 'Там' }) });
    expect(merged.a?.title).toBe('Тут');
  });

  it('свіже «прибрати» перемагає старе «додати»', () => {
    expect(mergeLibrary({ a: sub(1) }, { a: sub(2, { removed: true }) }).a?.removed).toBe(true);
  });

  it('повторне додавання знімає старий tombstone', () => {
    expect(mergeLibrary({ a: sub(3) }, { a: sub(2, { removed: true }) }).a?.removed).toBe(false);
  });

  it('не змінює аргументи', () => {
    const local: Library = { a: sub(1) };
    const remote: Library = { a: sub(2), b: sub(1) };
    mergeLibrary(local, remote);
    expect(local).toEqual({ a: sub(1) });
    expect(remote).toEqual({ a: sub(2), b: sub(1) });
  });
});

describe('sameLibrary', () => {
  it('однакові бібліотеки рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1) })).toBe(true);
  });

  it('різниця в одному полі — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1, { removed: true }) })).toBe(false);
  });

  it('різна кількість записів — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { a: sub(1), b: sub(1) })).toBe(false);
  });

  it('однакова кількість, але різні ключі — не рівні', () => {
    expect(sameLibrary({ a: sub(1) }, { b: sub(1) })).toBe(false);
  });
});
