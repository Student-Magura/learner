import { describe, expect, it } from 'vitest';
import { parseLibrary } from './parseLibrary';

const valid = { kind: 'catalog', title: 'Дизайн', addedAt: 1, updatedAt: 2, removed: false };

describe('parseLibrary', () => {
  it('пропускає коректний запис', () => {
    expect(parseLibrary({ a: valid })).toEqual({ a: valid });
  });

  it.each([null, 'рядок', 42, [valid]])('вміст %p — порожня бібліотека', (content) => {
    expect(parseLibrary(content)).toEqual({});
  });

  it.each([
    ['невідомий kind', { ...valid, kind: 'playlist' }],
    ['NaN у updatedAt', { ...valid, updatedAt: NaN }],
    ['Infinity в addedAt', { ...valid, addedAt: Infinity }],
    ['немає removed', { kind: 'course', title: 'x', addedAt: 1, updatedAt: 1 }],
    ['title не рядок', { ...valid, title: 7 }],
    ['не обʼєкт', 'catalog'],
  ])('відкидає запис (%s), лишаючи сусідній', (_name, broken) => {
    expect(parseLibrary({ bad: broken, good: valid })).toEqual({ good: valid });
  });

  it('прибирає зайві поля з чужого файлу', () => {
    expect(parseLibrary({ a: { ...valid, injected: '<script>' } })).toEqual({ a: valid });
  });
});
