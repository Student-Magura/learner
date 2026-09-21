import { describe, expect, it } from 'vitest';
import { naturalCompare } from './naturalSort';

describe('naturalCompare', () => {
  it('ставить 2 перед 10, а не після', () => {
    expect(['10 - Десятий', '2 - Другий'].sort(naturalCompare)).toEqual([
      '2 - Другий',
      '10 - Десятий',
    ]);
  });

  it('вважає 01 і 1 однаковим числом', () => {
    expect(naturalCompare('01 - Вступ', '1 - Вступ')).toBe(0);
  });

  it('сортує реальні назви модулів курсу правильно', () => {
    const input = [
      '03 - Feature Development',
      '01 - Feature Opportunity Validation',
      '04 - Feature Launch & Iteration',
      '02 - Feature Design',
    ];
    expect(input.sort(naturalCompare)).toEqual([
      '01 - Feature Opportunity Validation',
      '02 - Feature Design',
      '03 - Feature Development',
      '04 - Feature Launch & Iteration',
    ]);
  });

  it('не падає на назвах без цифр', () => {
    expect(['Бета', 'Альфа'].sort(naturalCompare)).toEqual(['Альфа', 'Бета']);
  });

  it('розрізняє великі й малі літери', () => {
    // Names differing only by case must NOT compare equal (non-zero result)
    expect(naturalCompare('Alpha', 'alpha')).not.toBe(0);
  });
});
