import { describe, expect, it, vi } from 'vitest';
import { answerTokenRequests } from './answerTokenRequests';

type Listener = (event: MessageEvent) => void;

function fakeContainer() {
  const listeners: Listener[] = [];
  return {
    container: {
      addEventListener: (type: string, listener: Listener) => {
        if (type === 'message') listeners.push(listener);
      },
    },
    dispatch: (data: unknown) => {
      const port = { postMessage: vi.fn() };
      const event = { data, ports: [port] } as unknown as MessageEvent;
      for (const l of listeners) l(event);
      return port;
    },
  };
}

describe('answerTokenRequests', () => {
  it('на GET_TOKEN відповідає { token } у переданий порт', async () => {
    const { container, dispatch } = fakeContainer();
    const getToken = vi.fn(async () => 'tok-1');
    answerTokenRequests(container, getToken);

    const port = dispatch({ type: 'GET_TOKEN' });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ token: 'tok-1' }));
    expect(getToken).toHaveBeenCalledWith({ force: false });
  });

  it('прокидує force до getToken', async () => {
    const { container, dispatch } = fakeContainer();
    const getToken = vi.fn(async () => 'tok-2');
    answerTokenRequests(container, getToken);

    const port = dispatch({ type: 'GET_TOKEN', force: true });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ token: 'tok-2' }));
    expect(getToken).toHaveBeenCalledWith({ force: true });
  });

  it('помилка getToken дає { error: true } і не виходить за межі слухача', async () => {
    const { container, dispatch } = fakeContainer();
    const getToken = vi.fn(async (): Promise<string> => {
      throw new Error('auth required');
    });
    answerTokenRequests(container, getToken);

    const port = dispatch({ type: 'GET_TOKEN' });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ error: true }));
  });

  it('інші повідомлення ігнорує', async () => {
    const { container, dispatch } = fakeContainer();
    const getToken = vi.fn(async () => 'tok-1');
    answerTokenRequests(container, getToken);

    const port = dispatch({ type: 'SOMETHING_ELSE' });
    await Promise.resolve();
    expect(getToken).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
