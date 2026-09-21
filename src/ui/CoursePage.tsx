import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import { TreeSection } from './TreeSection';
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
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <Link to="/" className="text-sm text-zinc-500 hover:underline">
        ← Усі курси
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-zinc-500">
          {stats.completedCount} з {stats.videoCount} уроків
        </p>
        <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {resumeId && (
          <Link
            to={`/course/${course.id}/lesson/${resumeId}`}
            className="rounded bg-zinc-900 px-4 py-2 text-white"
          >
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
          className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          {rescanning ? 'Оновлюємо…' : 'Оновити структуру'}
        </button>
      </div>

      {rescanError && (
        <p role="alert" className="text-sm text-red-700">
          {rescanError}
        </p>
      )}

      {course.tree.children.length === 0 ? (
        <p className="text-zinc-500">
          У цій папці не знайдено жодного відео. Перевірте, що доступ до папки відкритий і що
          вона містить відеофайли.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {course.tree.children.map((child) =>
            child.kind === 'folder' ? (
              <TreeSection
                key={child.id}
                node={child}
                courseId={course.id}
                progress={progress}
              />
            ) : (
              <TreeSection
                key={child.id}
                node={{
                  // Префікс, щоб синтетична папка не мала того самого id, що й відео в ній.
                  id: `section-${child.id}`,
                  kind: 'folder',
                  title: 'Без розділу',
                  children: [child],
                }}
                courseId={course.id}
                progress={progress}
              />
            ),
          )}
        </div>
      )}
    </main>
  );
}
