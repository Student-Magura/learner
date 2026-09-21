import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DriveError, createDriveApi } from './api';
import { server } from '../test/msw';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// sleep без реального очікування, щоб тести на backoff були швидкі
const api = () => createDriveApi(async () => 'tok', { sleep: async () => {} });

describe('listFolder', () => {
  it('передає supportsAllDrives та includeItemsFromAllDrives', async () => {
    let seen: URL | undefined;
    server.use(
      http.get(FILES, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ files: [] });
      }),
    );

    await api().listFolder('folder-1');

    expect(seen?.searchParams.get('supportsAllDrives')).toBe('true');
    expect(seen?.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(seen?.searchParams.get('q')).toBe("'folder-1' in parents and trashed = false");
  });

  it('додає заголовок Authorization', async () => {
    let auth: string | null = null;
    server.use(
      http.get(FILES, ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ files: [] });
      }),
    );

    await api().listFolder('folder-1');
    expect(auth).toBe('Bearer tok');
  });

  it('переводить durationMillis у секунди', async () => {
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({
          files: [
            {
              id: 'v1',
              name: 'Урок.mp4',
              mimeType: 'video/mp4',
              videoMediaMetadata: { durationMillis: '754000' },
            },
          ],
        }),
      ),
    );

    const [file] = await api().listFolder('folder-1');
    expect(file?.durationSec).toBe(754);
  });

  it('віддає durationSec = null, коли Drive не дав метаданих', async () => {
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'v1', name: 'a.mp4', mimeType: 'video/mp4' }] }),
      ),
    );

    const [file] = await api().listFolder('folder-1');
    expect(file?.durationSec).toBeNull();
  });

  it('склеює всі сторінки пагінації', async () => {
    let call = 0;
    server.use(
      http.get(FILES, () => {
        call += 1;
        return call === 1
          ? HttpResponse.json({
              files: [{ id: 'a', name: 'a', mimeType: 'video/mp4' }],
              nextPageToken: 'p2',
            })
          : HttpResponse.json({ files: [{ id: 'b', name: 'b', mimeType: 'video/mp4' }] });
      }),
    );

    const files = await api().listFolder('folder-1');
    expect(files.map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('обробка помилок', () => {
  it('на 401 робить одну спробу з примусовим поновленням токена', async () => {
    const tokens: string[] = [];
    let calls = 0;
    server.use(
      http.get(FILES, ({ request }) => {
        calls += 1;
        tokens.push(request.headers.get('Authorization') ?? '');
        if (calls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ files: [] });
      }),
    );

    const forced: boolean[] = [];
    const client = createDriveApi(
      async (opts) => {
        forced.push(opts?.force === true);
        return opts?.force ? 'tok-new' : 'tok-old';
      },
      { sleep: async () => {} },
    );

    await expect(client.listFolder('f')).resolves.toEqual([]);
    expect(forced).toEqual([false, true]);
    expect(tokens[1]).toBe('Bearer tok-new');
  });

  it('здається після другого 401 — повторний вхід уже не автоматичний', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(calls).toBe(2);
  });

  it('повторює 429 з backoff і врешті успішний', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({ files: [] });
      }),
    );

    await expect(api().listFolder('f')).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it('повторює 403 rateLimitExceeded, але не 403 за правами доступу', async () => {
    let rateCalls = 0;
    server.use(
      http.get(FILES, () => {
        rateCalls += 1;
        return HttpResponse.json(
          { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
          { status: 403 },
        );
      }),
    );
    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(rateCalls).toBeGreaterThan(1);

    server.resetHandlers();
    let permCalls = 0;
    server.use(
      http.get(FILES, () => {
        permCalls += 1;
        return HttpResponse.json(
          { error: { errors: [{ reason: 'insufficientFilePermissions' }] } },
          { status: 403 },
        );
      }),
    );
    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(permCalls).toBe(1);
  });

  it('здається після maxRetries', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const limited = createDriveApi(async () => 'tok', { sleep: async () => {}, maxRetries: 2 });
    await expect(limited.listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(calls).toBe(3); // перша спроба + 2 повтори
  });
});

describe('appDataFolder', () => {
  it('readAppData віддає null, коли файлу ще немає', async () => {
    server.use(http.get(FILES, () => HttpResponse.json({ files: [] })));
    await expect(api().readAppData('p.json')).resolves.toBeNull();
  });

  it('readAppData шукає у просторі appDataFolder і віддає вміст із modifiedTime', async () => {
    let seen: URL | undefined;
    server.use(
      http.get(FILES, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({
          files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }],
        });
      }),
      http.get(`${FILES}/f1`, () => HttpResponse.json({ hello: 'world' })),
    );

    const result = await api().readAppData('p.json');
    expect(seen?.searchParams.get('spaces')).toBe('appDataFolder');
    expect(result).toEqual({
      content: { hello: 'world' },
      modifiedTime: '2026-09-20T10:00:00.000Z',
    });
  });

  it('statAppData віддає modifiedTime, не завантажуючи вміст', async () => {
    let mediaCalls = 0;
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }] }),
      ),
      http.get(`${FILES}/f1`, () => {
        mediaCalls += 1;
        return HttpResponse.json({});
      }),
    );

    await expect(api().statAppData('p.json')).resolves.toEqual({
      id: 'f1',
      modifiedTime: '2026-09-20T10:00:00.000Z',
    });
    expect(mediaCalls).toBe(0);
  });

  it('writeAppData створює файл через POST, коли його ще немає', async () => {
    let method: string | undefined;
    server.use(
      http.get(FILES, () => HttpResponse.json({ files: [] })),
      http.post(UPLOAD, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ id: 'new', modifiedTime: '2026-09-20T11:00:00.000Z' });
      }),
    );

    const result = await api().writeAppData('p.json', { a: 1 });
    expect(method).toBe('POST');
    expect(result.modifiedTime).toBe('2026-09-20T11:00:00.000Z');
  });

  it('writeAppData оновлює наявний файл через PATCH', async () => {
    let patched = false;
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }] }),
      ),
      http.patch(`${UPLOAD}/f1`, async ({ request }) => {
        patched = true;
        await expect(request.text()).resolves.toBe('{"a":2}');
        return HttpResponse.json({ id: 'f1', modifiedTime: '2026-09-20T12:00:00.000Z' });
      }),
    );

    const result = await api().writeAppData('p.json', { a: 2 });
    expect(patched).toBe(true);
    expect(result.modifiedTime).toBe('2026-09-20T12:00:00.000Z');
  });
});
