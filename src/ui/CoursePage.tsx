import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CourseOutline } from './CourseOutline';
import { ProgressBar } from './ProgressBar';
import { primaryButton, secondaryButton } from './buttons';
import { ArrowLeftIcon, PlayIcon } from './icons';
import { aggregate, findResumeVideoId } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type CoursePageProps = {
  course: Course;
  progress: ProgressMap;
  /** Може відхилитися — наприклад, якщо права на папку змінилися. */
  onRescan(): Promise<void>;
};

export function CoursePage({ course, progress, onRescan }: CoursePageProps) {
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const stats = aggregate(course.tree, progress);
  const resumeId = findResumeVideoId(course, progress);
  const started = stats.completedCount > 0 || stats.ratio > 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeftIcon />
        Усі курси
      </Link>

      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{course.title}</h1>
        <p className="text-sm text-muted">
          {stats.completedCount} з {stats.videoCount} уроків
        </p>
        <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {resumeId && (
          <Link to={`/course/${course.id}/lesson/${resumeId}`} className={primaryButton}>
            <PlayIcon />
            {started ? 'Продовжити' : 'Почати курс'}
          </Link>
        )}
        <button
          type="button"
          disabled={rescanning}
          onClick={() => {
            setRescanning(true);
            setRescanError(null);
            onRescan()
              .catch((cause: unknown) => {
                // Без цього кнопка просто нічого не робила: відхилення
                // ковталося, і користувач не дізнавався, що сканування впало.
                setRescanError(
                  cause instanceof Error ? cause.message : 'Не вдалося оновити структуру курсу',
                );
              })
              .finally(() => setRescanning(false));
          }}
          className={secondaryButton}
        >
          {rescanning ? 'Оновлюємо…' : 'Оновити структуру'}
        </button>
      </div>

      {rescanError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {rescanError}
        </p>
      )}

      {course.tree.children.length === 0 ? (
        <p className="text-muted">
          У цій папці не знайдено жодного відео. Перевірте, що доступ до папки відкритий і що вона
          містить відеофайли.
        </p>
      ) : (
        <section aria-label="Програма курсу" className="-mx-4 sm:mx-0">
          <CourseOutline root={course.tree} courseId={course.id} progress={progress} />
        </section>
      )}
    </main>
  );
}
