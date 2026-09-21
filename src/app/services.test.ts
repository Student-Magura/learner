import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServices } from './services';

type Handler = (resp: { access_token?: string; expires_in?: number; error?: string }) => void;

let callback: Handler;
let requestAccessToken: ReturnType<typeof vi.fn>;
let issued: number;
let postMessage: ReturnType<typeof vi.fn>;
let controllerListeners: Array<() => void>;
let restoreServiceWorker: () => void;

/** GIS підміняємо так само, як у tokenClient.test.ts, але відповідаємо автоматично. */
function stubGis() {
  issued = 0;
  requestAccessToken = vi.fn(() => {
    queueMicrotask(() => {
      issued += 1;
      callback({ access_token: `tok-${issued}`, expires_in: 3600 });
    });
  });
  (globalThis as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Handler }) => {
          callback = cfg.callback;
          return { requestAccessToken };
        },
      },
    },
  };
}

function stubServiceWorker() {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  postMessage = vi.fn();
  controllerListeners = [];
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage },
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') controllerListeners.push(listener);
      },
    },
  });
  return () => {
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
  };
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
  stubGis();
  restoreServiceWorker = stubServiceWorker();
});

afterEach(() => {
  restoreServiceWorker();
  delete (globalThis as unknown as { google?: unknown }).google;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createServices', () => {
  it('без VITE_GOOGLE_CLIENT_ID падає зі зрозумілим текстом', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    await expect(createServices()).rejects.toThrow(/VITE_GOOGLE_CLIENT_ID/);
  });

  it('прокидує { force: true } із Drive API до tokenClient після 401', async () => {
    // Регрес: геттер токена був нуль-арною лямбдою, тому force губився, і Drive
    // отримував назад той самий токен, який щойно відкинув із 401 — тихе
    // поновлення не відбувалося взагалі, а екран входу не показувався.
    const responses = [
      new Response('', { status: 401, statusText: 'Unauthorized' }),
      new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift()!);
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await createServices();
    await api.listFolder('folder-1');

    // Два запити до GIS: тихий стартовий і вимушений після 401.
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryInit = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(retryInit?.headers).get('Authorization')).toBe('Bearer tok-2');
  });

  it('публікує токен у Service Worker, коли той бере сторінку під контроль', async () => {
    const { tokenClient } = await createServices();
    await tokenClient.getToken();
    postMessage.mockClear();

    expect(controllerListeners).toHaveLength(1);
    controllerListeners[0]!();
    // Слухач асинхронний: чекаємо, поки getToken віддасть кешований токен.
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: 'SET_TOKEN', token: 'tok-1' }),
    );
  });

  it('refreshToken бере новий токен і пересилає його воркеру', async () => {
    const { refreshToken } = await createServices();
    await refreshToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'SET_TOKEN', token: 'tok-1' });

    await refreshToken();
    // force не задовольняється кешем — це і є сенс виклику.
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'SET_TOKEN', token: 'tok-2' });
  });
});
