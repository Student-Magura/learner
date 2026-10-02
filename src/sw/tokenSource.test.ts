import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTokenSource } from './tokenSource';

type Ask = (force: boolean, clientId: string) => Promise<string | null>;

/** Запит до сторінки, на який тест відповідає вручну. */
function deferredAsk() {
  const pending: Array<(token: string | null) => void> = [];
  const ask = vi.fn<Ask>(
    () =>
      new Promise<string | null>((resolve) => {
        pending.push(resolve);
      }),
  );
  return { ask, answer: (token: string | null) => pending.shift()!(token) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createTokenSource', () => {
  it('з порожнім кешем питає сторінку', async () => {
    const ask = vi.fn<Ask>(async () => 'tok-1');
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    await expect(tokens.get('client-a')).resolves.toBe('tok-1');
    expect(ask).toHaveBeenCalledWith(false, 'client-a');
  });

  it('з теплим кешем сторінку не питає', async () => {
    const ask = vi.fn<Ask>(async () => 'tok-1');
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    await tokens.get('client-a');
    await expect(tokens.get('client-a')).resolves.toBe('tok-1');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('set() наповнює кеш без запиту до сторінки', async () => {
    const ask = vi.fn<Ask>(async () => 'from-page');
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    tokens.set('pushed');
    await expect(tokens.get('client-a')).resolves.toBe('pushed');
    expect(ask).not.toHaveBeenCalled();
  });

  it('одночасні get() ділять один запит до сторінки', async () => {
    const { ask, answer } = deferredAsk();
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    const all = Promise.all([tokens.get('a'), tokens.get('b'), tokens.get('c'), tokens.get('d')]);
    answer('tok-1');

    await expect(all).resolves.toEqual(['tok-1', 'tok-1', 'tok-1', 'tok-1']);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('renew() відкидає відхилений токен і питає сторінку з force', async () => {
    const answers = ['tok-1', 'tok-2'];
    const ask = vi.fn<Ask>(async () => answers.shift()!);
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    await tokens.get('a');
    await expect(tokens.renew('tok-1', 'a')).resolves.toBe('tok-2');
    expect(ask).toHaveBeenLastCalledWith(true, 'a');
    // Новий токен лишився в кеші.
    await expect(tokens.get('a')).resolves.toBe('tok-2');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('одночасні renew() того самого токена ділять один вимушений запит', async () => {
    const { ask, answer } = deferredAsk();
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });
    tokens.set('tok-1');

    const all = Promise.all([tokens.renew('tok-1', 'a'), tokens.renew('tok-1', 'a')]);
    answer('tok-2');

    await expect(all).resolves.toEqual(['tok-2', 'tok-2']);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(true, 'a');
  });

  it('renew() застарілого токена віддає вже поновлений із кешу', async () => {
    // Запит, що пішов зі старим токеном і повернувся з 401 пізніше за інших,
    // не має вдруге гнати сторінку по новий токен.
    const ask = vi.fn<Ask>(async () => 'tok-2');
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });
    tokens.set('tok-1');

    await tokens.renew('tok-1', 'a');
    await expect(tokens.renew('tok-1', 'a')).resolves.toBe('tok-2');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('сторінка, що мовчить, дає null після тайм-ауту, а не вічне очікування', async () => {
    vi.useFakeTimers();
    const ask = vi.fn<Ask>(() => new Promise<string | null>(() => {}));
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 5000 });

    let settled: string | null | undefined;
    void tokens.get('a').then((t) => {
      settled = t;
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
  });

  it('невдала спроба не отруює наступних: усі чекачі отримують null, наступний get() питає знову', async () => {
    const { ask, answer } = deferredAsk();
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    const first = Promise.all([tokens.get('a'), tokens.get('a')]);
    answer(null);
    await expect(first).resolves.toEqual([null, null]);

    const second = tokens.get('a');
    answer('tok-1');
    await expect(second).resolves.toBe('tok-1');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('відхилений запит до сторінки дає null і теж не отруює наступних', async () => {
    const ask = vi
      .fn<Ask>()
      .mockRejectedValueOnce(new Error('no client'))
      .mockResolvedValueOnce('tok-1');
    const tokens = createTokenSource({ requestFromClient: ask, timeoutMs: 1000 });

    await expect(tokens.get('a')).resolves.toBeNull();
    await expect(tokens.get('a')).resolves.toBe('tok-1');
  });
});
