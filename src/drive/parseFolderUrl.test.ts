import { describe, expect, it } from 'vitest';
import { parseFolderId } from './parseFolderUrl';

const ID = '1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk';

describe('parseFolderId', () => {
  it('дістає ID із посилання на папку', () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
  });

  it('дістає ID із посилання з query-параметрами', () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
  });

  it('дістає ID із посилання формату u/0', () => {
    expect(parseFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
  });

  it('приймає сам ID без URL', () => {
    expect(parseFolderId(ID)).toBe(ID);
  });

  it('обрізає пробіли навколо', () => {
    expect(parseFolderId(`  ${ID}  `)).toBe(ID);
  });

  it('повертає null на посиланні на файл, а не папку', () => {
    expect(parseFolderId('https://drive.google.com/file/d/10duPIS8qJnVzoWoRXVeG6YNkFr2Gb-fk/view'))
      .toBeNull();
  });

  it('повертає null на сміттєвому вводі', () => {
    expect(parseFolderId('не посилання')).toBeNull();
    expect(parseFolderId('')).toBeNull();
  });
});
