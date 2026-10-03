import { describe, expect, it } from 'vitest';
import { contentRangeFor } from './contentRange';

const TOTAL = 1000;

describe('contentRangeFor', () => {
  it('без Range-запиту заголовка немає: це відповідь 200 на весь файл', () => {
    expect(contentRangeFor(null, 1000, TOTAL)).toBeNull();
  });

  it('закритий діапазон', () => {
    expect(contentRangeFor('bytes=0-1023', 1000, 5000)).toBe('bytes 0-999/5000');
  });

  it('кінець береться з фактичної довжини шматка, а не із запиту', () => {
    // Drive може віддати менше, ніж просили, — заголовок мусить описувати
    // те, що реально прийшло, інакше плеєр збʼється з позиції.
    expect(contentRangeFor('bytes=100-', 200, TOTAL)).toBe('bytes 100-299/1000');
  });

  it('відкритий діапазон без відомої довжини тягнеться до кінця файлу', () => {
    expect(contentRangeFor('bytes=100-', null, TOTAL)).toBe('bytes 100-999/1000');
  });

  it('закритий діапазон без відомої довжини обрізається розміром файлу', () => {
    expect(contentRangeFor('bytes=900-5000', null, TOTAL)).toBe('bytes 900-999/1000');
  });

  it('суфіксний діапазон — останні N байтів', () => {
    expect(contentRangeFor('bytes=-100', 100, TOTAL)).toBe('bytes 900-999/1000');
  });

  it('суфікс довший за файл починається з нуля', () => {
    expect(contentRangeFor('bytes=-5000', null, TOTAL)).toBe('bytes 0-999/1000');
  });

  it('кінець ніколи не виходить за межі файлу', () => {
    expect(contentRangeFor('bytes=990-', 50, TOTAL)).toBe('bytes 990-999/1000');
  });

  it('початок за межами файлу — діапазон незадовольнимий', () => {
    expect(contentRangeFor('bytes=1000-', null, TOTAL)).toBeNull();
  });

  it('кілька діапазонів не підтримуються', () => {
    expect(contentRangeFor('bytes=0-10,20-30', null, TOTAL)).toBeNull();
  });

  it('сміття в заголовку', () => {
    expect(contentRangeFor('bytes=-', null, TOTAL)).toBeNull();
    expect(contentRangeFor('items=0-10', null, TOTAL)).toBeNull();
  });
});
