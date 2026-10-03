const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Складає `Content-Range` для відповіді 206, якої Drive нам не показує.
 *
 * Drive відповідає на Range-запит правильним шматком, але в CORS не відкриває
 * заголовок `Content-Range` (його немає в `Access-Control-Expose-Headers`), тож
 * воркер його не бачить. Без нього медіа-движок відкидає 206 як «Format error»,
 * і плеєр переходить на запасний шлях. Тому відтворюємо заголовок самі.
 *
 * `chunkLength` — фактична довжина тіла з `Content-Length`, який Drive відкриває.
 * Кінець діапазону рахуємо від неї, а не від запиту: на відкритий діапазон Drive
 * може віддати менше, ніж просили, і заголовок мусить описувати те, що прийшло.
 */
export function contentRangeFor(
  rangeHeader: string | null,
  chunkLength: number | null,
  totalSize: number,
): string | null {
  if (rangeHeader === null) return null;

  const match = SINGLE_RANGE.exec(rangeHeader.trim());
  if (!match) return null;
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;

  const last = totalSize - 1;
  let start: number;
  let requestedEnd: number;

  if (rawStart === '') {
    // Суфікс «-N»: останні N байтів файлу.
    start = Math.max(0, totalSize - Number(rawEnd));
    requestedEnd = last;
  } else {
    start = Number(rawStart);
    requestedEnd = rawEnd === '' ? last : Number(rawEnd);
  }

  if (start > last) return null;

  const end = Math.min(chunkLength !== null ? start + chunkLength - 1 : requestedEnd, last);
  return `bytes ${start}-${end}/${totalSize}`;
}
