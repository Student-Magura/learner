import { Link } from 'react-router-dom';
import { AddCourseDialog } from './AddCourseDialog';
import { ProgressBar } from './ProgressBar';
import { aggregate } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LibraryPageProps = {
  courses: Course[];
  progress: ProgressMap;
  onAddCourse(input: string): Promise<void>;
  onRemoveCourse(id: string): void;
};

export function LibraryPage({
  courses,
  progress,
  onAddCourse,
  onRemoveCourse,
}: LibraryPageProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Мої курси</h1>

      <AddCourseDialog onSubmit={onAddCourse} />

      {courses.length === 0 ? (
        <p className="text-zinc-500">
          Поки що порожньо — додайте перший курс, вставивши посилання на папку Google Drive.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {courses.map((course) => {
            const stats = aggregate(course.tree, progress);
            return (
              <li key={course.id} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    to={`/course/${course.id}`}
                    className="text-lg font-medium hover:underline"
                  >
                    {course.title}
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-zinc-500 hover:text-red-600"
                    onClick={() => {
                      if (window.confirm(`Прибрати «${course.title}» з бібліотеки?`)) {
                        onRemoveCourse(course.id);
                      }
                    }}
                  >
                    Прибрати
                  </button>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {stats.completedCount} з {stats.videoCount} уроків
                </p>
                <div className="mt-2">
                  <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
