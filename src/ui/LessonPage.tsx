import { Link } from 'react-router-dom';
import { CourseOutline } from './CourseOutline';
import { ProgressBar } from './ProgressBar';
import { primaryButton, secondaryButton } from './buttons';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';
import { lessonTitle } from './lessonTitle';
import { FallbackPlayer } from '../player/FallbackPlayer';
import { VideoPlayer } from '../player/VideoPlayer';
import { useMediaCapability } from '../player/useMediaCapability';
import { aggregate, flattenVideos } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LessonPageProps = {
  course: Course;
  progress: ProgressMap;
  videoId: string;
  onPosition(fileId: string, positionSec: number, durationSec: number | null): void;
  onToggleCompleted(fileId: string, completed: boolean): void;
  /** Поновлення токена перед тим, як плеєр визнає проксі непридатним. */
  onRecoverToken?(): Promise<void>;
};

export function LessonPage({
  course,
  progress,
  videoId,
  onPosition,
  onToggleCompleted,
  onRecoverToken,
}: LessonPageProps) {
  const { capability, markProxyUnsupported, retryProxy } = useMediaCapability();

  const videos = flattenVideos(course.tree);
  const index = videos.findIndex((v) => v.id === videoId);
  const video = index === -1 ? undefined : videos[index];

  const backLink = (
    <Link
      to={`/course/${course.id}`}
      className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-muted hover:text-fg"
    >
      <ArrowLeftIcon />
      {course.title}
    </Link>
  );

  if (!video) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        {backLink}
        <p className="mt-4 text-muted">
          Урок не знайдено. Можливо, файл прибрали з Drive — спробуйте оновити структуру курсу.
        </p>
      </main>
    );
  }

  const record = progress[videoId];
  const completed = record?.completed === true;
  const previous = index > 0 ? videos[index - 1] : undefined;
  const next = index < videos.length - 1 ? videos[index + 1] : undefined;
  const stats = aggregate(course.tree, progress);

  return (
    <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-8 lg:py-8">
        {backLink}

        <LessonHeading title={video.title} index={index} total={videos.length} />

        {capability === 'proxy' ? (
          <VideoPlayer
            key={videoId}
            fileId={videoId}
            initialPositionSec={record?.positionSec ?? 0}
            onProgress={(positionSec, durationSec) => onPosition(videoId, positionSec, durationSec)}
            onCompleted={() => onToggleCompleted(videoId, true)}
            onEnded={() => {}}
            onUnsupported={markProxyUnsupported}
            onRecoverToken={onRecoverToken}
          />
        ) : (
          <FallbackPlayer
            key={videoId}
            fileId={videoId}
            completed={completed}
            onToggleCompleted={() => onToggleCompleted(videoId, !completed)}
            onRetryProxy={retryProxy}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {capability === 'proxy' ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
              <input
                type="checkbox"
                checked={completed}
                onChange={() => onToggleCompleted(videoId, !completed)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              Переглянуто
            </label>
          ) : (
            <span />
          )}
          <nav aria-label="Уроки" className="flex flex-wrap gap-3">
            {previous && (
              <Link to={`/course/${course.id}/lesson/${previous.id}`} className={secondaryButton}>
                <ArrowLeftIcon />
                Попередній
              </Link>
            )}
            {next && (
              <Link
                to={`/course/${course.id}/lesson/${next.id}`}
                className={primaryButton}
                title={lessonTitle(next.title)}
              >
                Наступний
                <ArrowRightIcon />
              </Link>
            )}
          </nav>
        </div>
      </main>

      <aside
        aria-label="Програма курсу"
        className="border-t-2 border-rule bg-surface lg:max-h-[calc(100vh-4rem)] lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l-2 lg:border-t-0"
      >
        <div className="flex flex-col gap-3 px-4 pb-4 pt-6">
          <h2 className="text-lg font-extrabold">Програма курсу</h2>
          <p className="text-sm text-muted">
            {stats.completedCount} з {stats.videoCount} уроків
          </p>
          <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
        </div>
        <CourseOutline
          root={course.tree}
          courseId={course.id}
          progress={progress}
          currentVideoId={videoId}
        />
      </aside>
    </div>
  );
}

function LessonHeading({ title, index, total }: { title: string; index: number; total: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">
        Урок {index + 1} з {total}
      </span>
      <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
        {lessonTitle(title)}
      </h1>
    </div>
  );
}
