import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from './useMediaCapability';
import { shouldAutoComplete } from '../progress/aggregate';

export const POSITION_THROTTLE_MS = 5_000;
export const METADATA_TIMEOUT_MS = 6_000;
const SEEK_STEP_SEC = 5;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Позицію майже в кінці не відновлюємо: інакше відео відкривалося б на титрах. */
const RESUME_MAX_RATIO = 0.98;

export type VideoPlayerProps = {
  fileId: string;
  initialPositionSec: number;
  onProgress(positionSec: number, durationSec: number): void;
  onCompleted(): void;
  onEnded(): void;
  onUnsupported(): void;
  /**
   * Поновлює токен і пересилає його воркеру. Копія токена у воркері
   * протермінюється сама собою, якщо вкладка довго простояла без запитів до
   * Drive, і тоді проксі відповідає 401 — це не вердикт про платформу.
   */
  onRecoverToken?(): Promise<void>;
};

export function VideoPlayer({
  fileId,
  initialPositionSec,
  onProgress,
  onCompleted,
  onEnded,
  onUnsupported,
  onRecoverToken,
}: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastReportRef = useRef(0);
  const completedRef = useRef(false);
  const readyRef = useRef(false);
  const [speed, setSpeed] = useState(1);

  // Гонитва першого завантаження: на першому відкритті сторінки Service Worker
  // ще не контролює її (controller === null), тому проксі відповість 401 і
  // <video> кине error — а це не означає, що проксі непридатний, лише що
  // воркер ще не встиг перехопити запит. retriedRef обмежує повторну спробу
  // однією: якщо і вона провалиться, проксі справді не працює.
  const retriedRef = useRef(false);
  const failedRef = useRef(false);
  const cancelRetryRef = useRef<(() => void) | null>(null);

  // Окремо від `report`, бо cleanup ефекту на розмонтуванні не може покладатися
  // на ref.current: React відв'язує ref хостового вузла в фазі мутації коміту,
  // яка виконується ДО того, як спрацюють cleanup-функції passive-ефектів
  // (useEffect). До того моменту ref.current вже null, тому cleanup мусить
  // діяти на вузол, захоплений заздалегідь, а не перечитувати ref.
  const reportVideo = useCallback(
    (video: HTMLVideoElement | null, force: boolean) => {
      if (!video || !readyRef.current) return;

      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const now = Date.now();
      if (!force && now - lastReportRef.current < POSITION_THROTTLE_MS) return;
      lastReportRef.current = now;

      onProgress(video.currentTime, duration);

      if (!completedRef.current && shouldAutoComplete(video.currentTime, duration)) {
        completedRef.current = true;
        onCompleted();
      }
    },
    [onCompleted, onProgress],
  );

  const report = useCallback((force: boolean) => reportVideo(ref.current, force), [reportVideo]);

  const handleFailure = useCallback(() => {
    if (readyRef.current || failedRef.current) return;

    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
    const controlled = sw?.controller != null;

    if (controlled || retriedRef.current) {
      // Сторінка вже під контролем воркера, тобто проксі дійсно відповів
      // помилкою. Найчастіша тимчасова причина — протермінований токен у
      // воркері, тому спершу пробуємо його поновити й перезавантажити відео
      // рівно один раз. Вердикт «платформа непридатна» ставимо лише коли й це
      // не допомогло: інакше одна мережева невдача назавжди зсилала капабельний
      // браузер на плеєр Drive із ручними відмітками.
      if (controlled && !retriedRef.current && onRecoverToken) {
        retriedRef.current = true;

        let cancelled = false;
        cancelRetryRef.current = () => {
          cancelled = true;
        };

        void onRecoverToken()
          .then(() => {
            cancelRetryRef.current = null;
            if (cancelled || readyRef.current || failedRef.current) return;
            ref.current?.load();
          })
          .catch(() => {
            cancelRetryRef.current = null;
            // Поновити токен не вдалося — потрібен вхід; далі вирішує
            // застосунок, а урок не лишаємо без вердикту.
            if (cancelled || readyRef.current || failedRef.current) return;
            failedRef.current = true;
            onUnsupported();
          });
        return;
      }

      failedRef.current = true;
      onUnsupported();
      return;
    }

    // Ще не контролюється — чекаємо на воркер і пробуємо ще раз, рівно один раз.
    // Не оброблений навмисно компаунд-кейс: якщо ЦЕЙ виклик прийшов від
    // METADATA_TIMEOUT_MS (а не від error) і сам ретрай зависне — ready ніколи
    // не резолвиться, controllerchange не настає, а перезавантажений <video>
    // сам по собі не кидає error, — жоден таймер це не переармує, і урок може
    // чекати нескінченно. Малоймовірний випадок, другий таймаут навмисно не
    // додається.
    retriedRef.current = true;

    if (!sw) {
      // useMediaCapability вже відсіює цей випадок до рендеру плеєра, але про
      // всяк випадок не залишаємо урок висіти без вердикту.
      failedRef.current = true;
      onUnsupported();
      return;
    }

    let settled = false;
    const retry = () => {
      if (settled) return;
      settled = true;
      sw.removeEventListener('controllerchange', retry);
      cancelRetryRef.current = null;
      if (readyRef.current || failedRef.current) return;
      const video = ref.current;
      if (video) video.load();
    };

    // Повторюємо лише коли воркер справді взяв сторінку: ready означає «воркер
    // активний», а не «контролює». Після жорсткого перезавантаження (Shift+Reload)
    // сторінка лишається без контролера при активному воркері, і повтор пішов би
    // повз нього на статичний сервер. Такий воркер просимо взяти сторінку сам.
    // Якщо controllerchange так і не настане, вердикт поставить METADATA_TIMEOUT_MS.
    sw.addEventListener('controllerchange', retry);
    cancelRetryRef.current = () => {
      settled = true;
      sw.removeEventListener('controllerchange', retry);
    };
    void sw.ready.then((registration) => {
      if (sw.controller) retry();
      else registration.active?.postMessage({ type: 'CLAIM' });
    });
  }, [onRecoverToken, onUnsupported]);

  // Якщо компонент розмонтувався до того, як воркер відповів — не лишаємо
  // слухача controllerchange висіти на глобальному об'єкті назавжди.
  useEffect(() => {
    return () => {
      cancelRetryRef.current?.();
      cancelRetryRef.current = null;
    };
  }, []);

  // Якщо метадані не прийшли за відведений час — проксі не працює на цій платформі.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) handleFailure();
    }, METADATA_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fileId, handleFailure]);

  // Новий урок — новий відлік: інакше стан попереднього відео протік би в наступне.
  // Захист про всяк випадок: сьогодні Task 16 перемикає урок через key={videoId},
  // тобто цей ефект з тим самим fileId не перезапускається без повного
  // розмонтування (яке й так скасовує ретрай через cancelRetryRef вище) — але
  // якби виклик колись почав відбуватись без remount, незавершений ретрай
  // попереднього уроку міг би пройти скинуті прапорці й перезавантажити вже
  // новий <video>. Скасовуємо його тут теж.
  useEffect(() => {
    cancelRetryRef.current?.();
    cancelRetryRef.current = null;
    readyRef.current = false;
    completedRef.current = false;
    lastReportRef.current = 0;
    retriedRef.current = false;
    failedRef.current = false;
  }, [fileId]);

  const handleLoadedMetadata = useCallback(() => {
    const video = ref.current;
    if (!video) return;
    readyRef.current = true;

    const duration = video.duration;
    if (
      initialPositionSec > 0 &&
      Number.isFinite(duration) &&
      initialPositionSec < duration * RESUME_MAX_RATIO
    ) {
      video.currentTime = initialPositionSec;
    }
    video.playbackRate = speed;
  }, [initialPositionSec, speed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Не крадемо клавіші в полів введення й у кнопок.
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;

      const video = ref.current;
      if (!video) return;

      if (event.key === ' ') {
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        video.currentTime = video.currentTime + SEEK_STEP_SEC;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SEC);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Закриття вкладки не має коштувати останніх хвилин перегляду — так само як і
  // розмонтування (перехід на наступний урок). Вузол захоплюємо тут, у тілі
  // ефекту, поки ref ще прив'язаний: на unmount cleanup спрацює вже після
  // того, як React обнулить ref.current, тому flush() у cleanup діє саме на
  // цей захоплений вузол, а не читає ref заново.
  useEffect(() => {
    const video = ref.current;
    const flush = () => reportVideo(video, true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [reportVideo]);

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={ref}
        src={mediaUrl(fileId)}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={() => report(false)}
        onPause={() => report(true)}
        onError={() => handleFailure()}
        onEnded={() => {
          report(true);
          if (!completedRef.current) {
            completedRef.current = true;
            onCompleted();
          }
          onEnded();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Швидкість"
          className="grid w-full grid-cols-6 gap-1 sm:flex sm:w-auto sm:gap-1.5"
        >
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => {
                setSpeed(value);
                if (ref.current) ref.current.playbackRate = value;
              }}
              className={`min-h-11 border-2 border-fg px-1 text-sm sm:min-w-12 sm:px-2 font-semibold tabular-nums ${
                speed === value ? 'bg-fg text-bg' : 'text-fg hover:bg-soft'
              }`}
            >
              {value}×
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-muted sm:inline">пробіл — пауза · ← → — 5 с</span>
      </div>
    </div>
  );
}
