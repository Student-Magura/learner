import { describe, expect, it } from 'vitest';
import { lessonTitle } from './lessonTitle';

describe('lessonTitle', () => {
  it('прибирає розширення відеофайлу', () => {
    expect(lessonTitle('Five Types of PM Leverage.mp4')).toBe('Five Types of PM Leverage');
    expect(lessonTitle('Intro.MOV')).toBe('Intro');
  });

  it('повертає двокрапку, яку Drive замінив на «_»', () => {
    expect(lessonTitle('BONUS_ Module Recap.mp4')).toBe('BONUS: Module Recap');
  });

  it('не чіпає підкреслення всередині слів і чужі розширення', () => {
    expect(lessonTitle('snake_case.pdf')).toBe('snake_case.pdf');
  });
});
