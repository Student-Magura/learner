import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, createTokenClient } from './tokenClient';

type Handler = (resp: { access_token?: string; expires_in?: number; error?: string }) => void;

let callback: Handler;
let requestAccessToken: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
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
  delete (globalThis as any).google;
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
});
