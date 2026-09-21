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
};

export function VideoPlayer({
  fileId,
  initialPositionSec,
  onProgress,
  onCompleted,
  onEnded,
  onUnsupported,
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

  const report = useCallback(
    (force: boolean) => {
      const video = ref.current;
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

  const handleFailure = useCallback(() => {
    if (readyRef.current || failedRef.current) return;

    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
    const controlled = sw?.controller != null;

    if (controlled || retriedRef.current) {
      failedRef.current = true;
      onUnsupported();
      return;
    }

    // Ще не контролюється — чекаємо на воркер і пробуємо ще раз, рівно один раз.
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

    sw.addEventListener('controllerchange', retry);
    cancelRetryRef.current = () => {
      settled = true;
      sw.removeEventListener('controllerchange', retry);
    };
    void sw.ready.then(retry);
  }, [onUnsupported]);

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
  useEffect(() => {
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

  // Закриття вкладки не має коштувати останніх хвилин перегляду.
  useEffect(() => {
    const flush = () => report(true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [report]);

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={ref}
        src={mediaUrl(fileId)}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg bg-black"
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
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        Швидкість
        <select
          aria-label="Швидкість"
          value={speed}
          className="rounded border border-zinc-300 px-2 py-1"
          onChange={(event) => {
            const value = Number(event.target.value);
            setSpeed(value);
            if (ref.current) ref.current.playbackRate = value;
          }}
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <span className="text-zinc-400">пробіл — пауза, ← → — 5 с</span>
      </label>
    </div>
  );
}
