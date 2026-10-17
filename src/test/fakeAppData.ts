import { vi } from 'vitest';
import type { DriveApi } from '../drive/api';

type AppDataApi = Pick<DriveApi, 'statAppData' | 'readAppData' | 'writeAppData'>;

export type FakeAppData = AppDataApi & {
  files: Record<string, { content: unknown; modifiedTime: string }>;
};

/**
 * appDataFolder у пам'яті: кілька файлів за назвою. Один екземпляр, переданий
 * двом сторам, моделює два пристрої на одному акаунті. Вміст копіюється на
 * вході й виході — як через мережу.
 */
export function fakeAppData(): FakeAppData {
  const files: FakeAppData['files'] = {};
  let tick = 0;
  const copy = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

  return {
    files,
    statAppData: vi.fn(async (name: string) => {
      const file = files[name];
      return file ? { id: name, modifiedTime: file.modifiedTime } : null;
    }),
    readAppData: vi.fn(async (name: string) => {
      const file = files[name];
      return file ? { content: copy(file.content), modifiedTime: file.modifiedTime } : null;
    }),
    writeAppData: vi.fn(async (name: string, content: unknown) => {
      tick += 1;
      const modifiedTime = `2026-10-13T00:00:${String(tick).padStart(2, '0')}.000Z`;
      files[name] = { content: copy(content), modifiedTime };
      return { modifiedTime };
    }),
  };
}
