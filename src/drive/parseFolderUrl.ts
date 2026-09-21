/** Drive ID — 20+ символів з обмеженого алфавіту. */
const BARE_ID = /^[A-Za-z0-9_-]{20,}$/;
const FOLDER_URL = /\/folders\/([A-Za-z0-9_-]{20,})/;

/**
 * Приймає посилання на папку Drive у будь-якому зі звичних форматів або сам ID.
 * Повертає null, якщо це не папка — зокрема для посилань на окремий файл.
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = FOLDER_URL.exec(trimmed);
  if (fromUrl) return fromUrl[1] ?? null;

  if (trimmed.includes('/')) return null;
  return BARE_ID.test(trimmed) ? trimmed : null;
}
