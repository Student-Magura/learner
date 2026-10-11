import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, createTokenClient, isGisLoaded, waitForGis } from './tokenClient';

type Handler = (resp: { access_token?: string; expires_in?: number; error?: string }) => void;

let callback: Handler;
let requestAccessToken: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
  localStorage.clear();
  requestAccessToken = vi.fn();
  (globalThis as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Handler }) => {
          callback = cfg.callback;
          return { requestAccessToken };
        },
      },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as any).google;
});

describe('waitForGis', () => {
  it('одразу проходить, коли скрипт уже виконався', async () => {
    expect(isGisLoaded()).toBe(true);
    await expect(waitForGis(1_000)).resolves.toBeUndefined();
  });

  it('чекає на скрипт, що приїхав із запізненням', async () => {
    const google = (globalThis as any).google;
    delete (globalThis as any).google;
    expect(isGisLoaded()).toBe(false);

    const waiting = waitForGis(5_000, 50);
    await vi.advanceTimersByTimeAsync(200);
    (globalThis as any).google = google;
    await vi.advanceTimersByTimeAsync(100);

    await expect(waiting).resolves.toBeUndefined();
  });

  it('після таймауту дає людський текст, а не сирий TypeError', async () => {
    delete (globalThis as any).google;

    const waiting = waitForGis(1_000, 50);
    const assertion = expect(waiting).rejects.toThrow(/Google Sign-In/);
    await vi.advanceTimersByTimeAsync(1_500);
    await assertion;
  });
});

describe('tokenClient', () => {
  it('signIn повертає токен із відповіді GIS', async () => {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await expect(promise).resolves.toBe('tok-1');
  });

  it('getToken віддає кешований токен без нового запиту до GIS', async () => {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;

    requestAccessToken.mockClear();
    await expect(client.getToken()).resolves.toBe('tok-1');
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  it('getToken тихо поновлює токен, що майже прострочений', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    // 59 хвилин пізніше: до закінчення менше запасу в 60 с.
    vi.setSystemTime(new Date('2026-09-20T12:59:30Z'));
    const second = client.getToken();
    callback({ access_token: 'tok-2', expires_in: 3600 });

    await expect(second).resolves.toBe('tok-2');
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('getToken({ force: true }) обходить кеш і бере новий токен', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    const forced = client.getToken({ force: true });
    callback({ access_token: 'tok-2', expires_in: 3600 });

    await expect(forced).resolves.toBe('tok-2');
  });

  it('getToken кидає AuthRequiredError, коли тихе поновлення не вдалося', async () => {
    const client = createTokenClient('cid');
    const promise = client.getToken();
    callback({ error: 'interaction_required' });
    await expect(promise).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('onChange повідомляє про вхід і вихід', async () => {
    const client = createTokenClient('cid');
    const seen: boolean[] = [];
    client.onChange((v) => seen.push(v));

    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;
    client.signOut();

    expect(seen).toEqual([true, false]);
  });

  it('getToken об’єднує одночасні виклики в один запит до GIS', async () => {
    const client = createTokenClient('cid');
    const first = client.getToken();
    const second = client.getToken();

    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    callback({ access_token: 'tok-1', expires_in: 3600 });

    await expect(first).resolves.toBe('tok-1');
    await expect(second).resolves.toBe('tok-1');
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('після невдалого forced-поновлення старий токен більше не вважається свіжим', async () => {
    const client = createTokenClient('cid');
    const seen: boolean[] = [];
    client.onChange((v) => seen.push(v));

    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    const forced = client.getToken({ force: true });
    callback({ error: 'interaction_required' });
    await expect(forced).rejects.toBeInstanceOf(AuthRequiredError);

    requestAccessToken.mockClear();
    const after = client.getToken();
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
    callback({ access_token: 'tok-2', expires_in: 3600 });
    await expect(after).resolves.toBe('tok-2');

    expect(seen).toEqual([true, false, true]);
  });

  it('getToken({ force: true }) під час активного тихого поновлення не бере його результат', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;
    requestAccessToken.mockClear();

    // Токен от-от протермінується: фонове тихе поновлення вже в польоті.
    vi.setSystemTime(new Date('2026-09-20T12:59:30Z'));
    const silent = client.getToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(1);

    // Паралельно Drive відповів 401 — форс-виклик не має заспокоюватись
    // токеном із запиту, що стартував до нього.
    const forced = client.getToken({ force: true });
    expect(requestAccessToken).toHaveBeenCalledTimes(1);

    callback({ access_token: 'tok-1', expires_in: 3600 });
    await expect(silent).resolves.toBe('tok-1');

    // Форс-виклик отримав власний, окремий запит замість токена, що щойно
    // повернувся з уже застарілого польоту.
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    callback({ access_token: 'tok-2', expires_in: 3600 });
    await expect(forced).resolves.toBe('tok-2');
  });

  it('signIn під час активного тихого запиту все одно доходить до діалогу згоди', async () => {
    const client = createTokenClient('cid');

    // Тихий getToken() уже в польоті (наприклад, фонове поновлення на
    // завантаженні сторінки).
    const silent = client.getToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });

    // Користувач тим часом тисне «увійти».
    const signInPromise = client.signIn();
    // signIn не повинен коалесцуватись у тихий запит і не робить власний
    // виклик, доки той не завершиться.
    expect(requestAccessToken).toHaveBeenCalledTimes(1);

    // Тихий запит падає саме так, як і очікується, коли потрібна згода.
    callback({ error: 'interaction_required' });
    await expect(silent).rejects.toBeInstanceOf(AuthRequiredError);

    // Одразу після цього для signIn мусить стартувати окремий, справжній
    // інтерактивний запит — а не мовчазне відхилення тим самим провалом.
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(requestAccessToken).toHaveBeenLastCalledWith({ prompt: 'consent' });

    callback({ access_token: 'tok-consent', expires_in: 3600 });
    await expect(signInPromise).resolves.toBe('tok-consent');
  });
});

describe('tokenClient після перезавантаження сторінки', () => {
  async function signInOnce(): Promise<void> {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;
  }

  it('новий клієнт підхоплює чинний токен без запиту до GIS', async () => {
    await signInOnce();
    requestAccessToken.mockClear();

    vi.setSystemTime(new Date('2026-09-20T12:30:00Z'));
    const reloaded = createTokenClient('cid');

    expect(reloaded.isSignedIn()).toBe(true);
    await expect(reloaded.getToken()).resolves.toBe('tok-1');
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  it('протермінований токен не відновлюється', async () => {
    await signInOnce();

    vi.setSystemTime(new Date('2026-09-20T13:30:00Z'));
    const reloaded = createTokenClient('cid');

    expect(reloaded.isSignedIn()).toBe(false);
  });

  it('після signOut перезавантаження показує вхід', async () => {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;
    client.signOut();

    expect(createTokenClient('cid').isSignedIn()).toBe(false);
  });

  it('після невдалого поновлення відкинутий токен не відновлюється', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    const forced = client.getToken({ force: true });
    callback({ error: 'interaction_required' });
    await expect(forced).rejects.toBeInstanceOf(AuthRequiredError);

    expect(createTokenClient('cid').isSignedIn()).toBe(false);
  });

  it('недоступне сховище не ламає вхід', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const client = createTokenClient('cid');
    expect(client.isSignedIn()).toBe(false);
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await expect(promise).resolves.toBe('tok-1');
    expect(client.isSignedIn()).toBe(true);
  });
});
