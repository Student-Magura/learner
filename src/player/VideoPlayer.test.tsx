import { fireEvent, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

/** jsdom не відтворює медіа, тому duration і currentTime підміняємо вручну. */
function stubMedia(video: HTMLVideoElement, duration: number) {
  let current = 0;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => current,
    set: (v: number) => {
      current = v;
    },
  });
  video.play = vi.fn(async () => {});
  video.pause = vi.fn();
  return {
    seekTo(seconds: number) {
      current = seconds;
    },
  };
}

function setup(props: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  const handlers = {
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
    onEnded: vi.fn(),
    onUnsupported: vi.fn(),
  };
  const view = render(
    <VideoPlayer fileId="file-1" initialPositionSec={0} {...handlers} {...props} />,
  );
  const video = view.container.querySelector('video')!;
  return { ...handlers, video, view };
}

/** Підміняє navigator.serviceWorker цим об'єктом лише на час тесту. */
function stubServiceWorker(value: Partial<ServiceWorkerContainer> | undefined) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', {
    value,
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('VideoPlayer', () => {
  it('тягне відео через маршрут медіа-проксі', () => {
    const { video } = setup();
    expect(video.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}media/file-1`);
  });

  it('відновлює позицію після loadedmetadata', () => {
    const { video } = setup({ initialPositionSec: 125 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(125);
  });

  it('не перемотує, якщо збереженої позиції немає', () => {
    const { video } = setup({ initialPositionSec: 0 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0);
  });

  it('не перемотує в самий кінець, коли відео вже було додивлене', () => {
    // Інакше повторне відкриття завершеного відео відкривалося б на титрах.
    const { video } = setup({ initialPositionSec: 599 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0);
  });

  it('повідомляє позицію не частіше ніж раз на 5 секунд', () => {
    const { video, onProgress } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(10);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(1);

    media.seekTo(11);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(20);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(20, 600);
  });

  it('повідомляє позицію негайно на pause, минаючи тротлінг', () => {
    const { video, onProgress } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    onProgress.mockClear();

    media.seekTo(33);
    fireEvent(video, new Event('pause'));
    expect(onProgress).toHaveBeenCalledWith(33, 600);
  });

  it('репортить позицію при демонтажі, навіть коли ref вже відв’язаний', () => {
    // React відв'язує ref хостового вузла до того, як спрацює cleanup ефекту,
    // тому cleanup не може покладатися на повторне читання ref.current.
    const { video, view, onProgress } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    onProgress.mockClear();

    media.seekTo(42);
    // timeupdate навмисно не фаєримо: throttle ще не мав шансу відзвітувати.

    view.unmount();

    expect(onProgress).toHaveBeenCalledWith(42, 600);
  });

  it('викликає onCompleted на 90% тривалості', () => {
    const { video, onCompleted } = setup();
    const media = stubMedia(video, 100);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(89);
    fireEvent(video, new Event('timeupdate'));
    expect(onCompleted).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(90);
    fireEvent(video, new Event('timeupdate'));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('не викликає onCompleted повторно', () => {
    const { video, onCompleted } = setup();
    const media = stubMedia(video, 100);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(95);
    fireEvent(video, new Event('timeupdate'));
    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(99);
    fireEvent(video, new Event('timeupdate'));

    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('викликає onUnsupported на помилці завантаження', () => {
    const restore = stubServiceWorker({ controller: {} as ServiceWorker });
    const { video, onUnsupported } = setup();
    fireEvent(video, new Event('error'));
    expect(onUnsupported).toHaveBeenCalledTimes(1);
    restore();
  });

  it('викликає onUnsupported, якщо метадані не прийшли за 6 секунд', () => {
    const restore = stubServiceWorker({ controller: {} as ServiceWorker });
    const { onUnsupported } = setup();
    act(() => vi.advanceTimersByTime(6_000));
    expect(onUnsupported).toHaveBeenCalledTimes(1);
    restore();
  });

  it('не викликає onUnsupported, якщо метадані встигли прийти', () => {
    const { video, onUnsupported } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(onUnsupported).not.toHaveBeenCalled();
  });

  it('змінює швидкість відтворення кнопкою', () => {
    const { video, view } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    fireEvent.click(view.getByRole('button', { name: '1.5×' }));
    expect(video.playbackRate).toBe(1.5);
    expect(view.getByRole('button', { name: '1.5×' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('пробіл ставить на паузу і знімає з неї', () => {
    const { video } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    Object.defineProperty(video, 'paused', { configurable: true, get: () => true });
    fireEvent.keyDown(window, { key: ' ' });
    expect(video.play).toHaveBeenCalled();
  });

  it('стрілки перемотують на 5 секунд', () => {
    const { video } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    media.seekTo(50);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(55);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(50);
  });

  it('не перехоплює клавіші, коли фокус у полі введення', () => {
    const { video } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: ' ' });

    expect(video.play).not.toHaveBeenCalled();
    input.remove();
  });

  describe('гонитва першого завантаження, коли Service Worker ще не контролює сторінку', () => {
    it('не викликає onUnsupported на error, поки controller === null; після готовності воркера перезавантажує відео', async () => {
      let readyResolve: (reg: unknown) => void = () => {};
      const ready = new Promise((resolve) => {
        readyResolve = resolve;
      });
      const restore = stubServiceWorker({
        controller: null,
        ready,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer);

      const { video, onUnsupported } = setup();
      const loadSpy = vi.fn();
      video.load = loadSpy;

      fireEvent(video, new Event('error'));
      expect(onUnsupported).not.toHaveBeenCalled();

      readyResolve({});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(onUnsupported).not.toHaveBeenCalled();

      restore();
    });

    it('викликає onUnsupported один раз, якщо сторінка вже контролюється при помилці', () => {
      const restore = stubServiceWorker({ controller: {} as ServiceWorker });
      const { video, onUnsupported } = setup();
      fireEvent(video, new Event('error'));
      expect(onUnsupported).toHaveBeenCalledTimes(1);
      restore();
    });

    it('на контрольованій сторінці спершу поновлює токен і перезавантажує відео', async () => {
      // Регрес: будь-який провал на контрольованій сторінці вважався вердиктом
      // про платформу, тому протермінований у воркері токен (годину простою)
      // назавжди зсилав капабельний Chrome на плеєр Drive із ручними відмітками.
      const restore = stubServiceWorker({ controller: {} as ServiceWorker });
      const onRecoverToken = vi.fn(async () => {});
      const { video, onUnsupported } = setup({ onRecoverToken });
      const loadSpy = vi.fn();
      video.load = loadSpy;

      fireEvent(video, new Event('error'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onRecoverToken).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(onUnsupported).not.toHaveBeenCalled();
      restore();
    });

    it('визнає платформу непридатною, якщо й після поновлення токена відео не пішло', async () => {
      const restore = stubServiceWorker({ controller: {} as ServiceWorker });
      const onRecoverToken = vi.fn(async () => {});
      const { video, onUnsupported } = setup({ onRecoverToken });
      video.load = vi.fn();

      fireEvent(video, new Event('error'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onUnsupported).not.toHaveBeenCalled();

      // Бюджет повторів — рівно один, тому справді зламаний проксі доходить
      // до відкоту без зайвих пауз.
      fireEvent(video, new Event('error'));
      expect(onUnsupported).toHaveBeenCalledTimes(1);
      expect(onRecoverToken).toHaveBeenCalledTimes(1);
      restore();
    });

    it('визнає платформу непридатною, якщо поновлення токена впало', async () => {
      const restore = stubServiceWorker({ controller: {} as ServiceWorker });
      const onRecoverToken = vi.fn(async () => {
        throw new Error('потрібен повторний вхід');
      });
      const { video, onUnsupported } = setup({ onRecoverToken });
      video.load = vi.fn();

      fireEvent(video, new Event('error'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onUnsupported).toHaveBeenCalledTimes(1);
      restore();
    });

    it('не ставить вердикт, якщо урок закрили поки поновлювався токен', async () => {
      const restore = stubServiceWorker({ controller: {} as ServiceWorker });
      let release: () => void = () => {};
      const onRecoverToken = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const { video, view, onUnsupported } = setup({ onRecoverToken });
      video.load = vi.fn();

      fireEvent(video, new Event('error'));
      view.unmount();
      release();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onUnsupported).not.toHaveBeenCalled();
      restore();
    });

    it('викликає onUnsupported, якщо повторна спроба після готовності воркера теж провалюється', async () => {
      let readyResolve: (reg: unknown) => void = () => {};
      const ready = new Promise((resolve) => {
        readyResolve = resolve;
      });
      const restore = stubServiceWorker({
        controller: null,
        ready,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer);

      const { video, onUnsupported } = setup();
      video.load = vi.fn();

      fireEvent(video, new Event('error'));
      expect(onUnsupported).not.toHaveBeenCalled();

      readyResolve({});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onUnsupported).not.toHaveBeenCalled();

      fireEvent(video, new Event('error'));
      expect(onUnsupported).toHaveBeenCalledTimes(1);

      restore();
    });
  });
});
