import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import { TreeSection } from './TreeSection';
import { aggregate, findResumeVideoId } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type CoursePageProps = {
  course: Course;
  progress: ProgressMap;
  onRescan(): void;
};

export function CoursePage({ course, progress, onRescan }: CoursePageProps) {
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
          onClick={onRescan}
          className="rounded border border-zinc-300 px-4 py-2 text-sm"
        >
          Оновити структуру
        </button>
      </div>

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
