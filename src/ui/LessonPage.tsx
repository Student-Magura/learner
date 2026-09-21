import { Link } from 'react-router-dom';
import { FallbackPlayer } from '../player/FallbackPlayer';
import { VideoPlayer } from '../player/VideoPlayer';
import { useMediaCapability } from '../player/useMediaCapability';
import { flattenVideos } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LessonPageProps = {
  course: Course;
  progress: ProgressMap;
  videoId: string;
  onPosition(fileId: string, positionSec: number, durationSec: number | null): void;
  onToggleCompleted(fileId: string, completed: boolean): void;
};

export function LessonPage({
  course,
  progress,
  videoId,
  onPosition,
  onToggleCompleted,
}: LessonPageProps) {
  const { capability, markProxyUnsupported } = useMediaCapability();

  const videos = flattenVideos(course.tree);
  const index = videos.findIndex((v) => v.id === videoId);
  const video = index === -1 ? undefined : videos[index];

  if (!video) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <Link to={`/course/${course.id}`} className="text-sm text-zinc-500 hover:underline">
          ← До курсу
        </Link>
        <p className="mt-4 text-zinc-500">
          Урок не знайдено. Можливо, файл прибрали з Drive — спробуйте оновити структуру курсу.
        </p>
      </main>
    );
  }

  const record = progress[videoId];
  const completed = record?.completed === true;
  const previous = index > 0 ? videos[index - 1] : undefined;
  const next = index < videos.length - 1 ? videos[index + 1] : undefined;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link to={`/course/${course.id}`} className="text-sm text-zinc-500 hover:underline">
        ← {course.title}
      </Link>

      <h1 className="text-xl font-semibold">{video.title}</h1>

      {capability === 'proxy' ? (
        <>
          <VideoPlayer
            key={videoId}
            fileId={videoId}
            initialPositionSec={record?.positionSec ?? 0}
            onProgress={(positionSec, durationSec) =>
              onPosition(videoId, positionSec, durationSec)
            }
            onCompleted={() => onToggleCompleted(videoId, true)}
            onEnded={() => {}}
            onUnsupported={markProxyUnsupported}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={completed}
              onChange={() => onToggleCompleted(videoId, !completed)}
              className="h-4 w-4"
            />
            Переглянуто
          </label>
        </>
      ) : (
        <FallbackPlayer
          key={videoId}
          fileId={videoId}
          completed={completed}
          onToggleCompleted={() => onToggleCompleted(videoId, !completed)}
        />
      )}

      <nav className="flex justify-between gap-4 pt-2">
        {previous ? (
          <Link
            to={`/course/${course.id}/lesson/${previous.id}`}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            ← Попередній
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/course/${course.id}/lesson/${next.id}`}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            Наступний →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
