import { Link } from 'react-router-dom';
import { AddCourseDialog } from './AddCourseDialog';
import { ProgressBar } from './ProgressBar';
import { PlayIcon } from './icons';
import { lessonTitle } from './lessonTitle';
import { naturalCompare } from '../drive/naturalSort';
import { aggregate, findResumeVideoId, flattenVideos } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LibraryPageProps = {
  courses: Course[];
  progress: ProgressMap;
  /** Каталог оновлюється у фоні. */
  catalogSyncing: boolean;
  onAddCourse(input: string): Promise<void>;
  onRemoveCourse(id: string): void;
};

/** Курс, який дивилися останнім, і урок, з якого його продовжити. */
function findContinue(courses: Course[], progress: ProgressMap) {
  let best: { course: Course; updatedAt: number } | null = null;
  for (const course of courses) {
    for (const video of flattenVideos(course.tree)) {
      const updatedAt = progress[video.id]?.updatedAt;
      if (updatedAt !== undefined && (!best || updatedAt > best.updatedAt)) {
        best = { course, updatedAt };
      }
    }
  }
  if (!best) return null;

  const videos = flattenVideos(best.course.tree);
  const videoId = findResumeVideoId(best.course, progress);
  const index = videos.findIndex((v) => v.id === videoId);
  if (index === -1) return null;
  if (aggregate(best.course.tree, progress).completedCount === videos.length) return null;
  return { course: best.course, video: videos[index]!, index, total: videos.length };
}

export function LibraryPage({
  courses,
  progress,
  catalogSyncing,
  onAddCourse,
  onRemoveCourse,
}: LibraryPageProps) {
  const resume = findContinue(courses, progress);
  const catalog = courses
    .filter((c) => c.source === 'catalog')
    .sort((a, b) => naturalCompare(a.title, b.title));
  const own = courses.filter((c) => c.source !== 'catalog');

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Мої курси</h1>

      {resume && (
        <section className="flex flex-col gap-4 bg-hero p-6 text-on-hero sm:p-10">
          <span className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">
            Продовжити
          </span>
          <span className="text-2xl font-extrabold leading-tight sm:text-3xl">
            {lessonTitle(resume.video.title)}
          </span>
          <span className="text-sm opacity-80">
            {resume.course.title} · урок {resume.index + 1} з {resume.total}
          </span>
          <Link
            to={`/course/${resume.course.id}/lesson/${resume.video.id}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 self-start bg-hero-action px-5 text-[15px] font-bold text-on-hero-action hover:opacity-90"
          >
            <PlayIcon />
            Дивитись далі
          </Link>
        </section>
      )}

      {(catalog.length > 0 || catalogSyncing) && (
        <section aria-labelledby="catalog-heading" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 id="catalog-heading" className="text-2xl font-extrabold tracking-tight">
              Каталог
            </h2>
            {catalogSyncing && (
              <p role="status" className="animate-pulse text-sm text-muted">
                Оновлюємо каталог…
              </p>
            )}
          </div>
          {catalog.length > 0 && <CourseGrid courses={catalog} progress={progress} />}
        </section>
      )}

      <section aria-labelledby="own-heading" className="flex flex-col gap-6">
        <h2 id="own-heading" className="text-2xl font-extrabold tracking-tight">
          Власні курси
        </h2>
        <AddCourseDialog onSubmit={onAddCourse} onClose={() => {}} />
        {own.length === 0 ? (
          <p className="text-muted">
            Поки що порожньо — додайте перший курс, вставивши посилання на папку Google Drive.
          </p>
        ) : (
          <CourseGrid courses={own} progress={progress} onRemove={onRemoveCourse} />
        )}
      </section>
    </main>
  );
}

/** Без onRemove картка не має кнопки «Прибрати» — так виглядають курси каталогу. */
function CourseGrid({
  courses,
  progress,
  onRemove,
}: {
  courses: Course[];
  progress: ProgressMap;
  onRemove?(id: string): void;
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const stats = aggregate(course.tree, progress);
        return (
          <li key={course.id} className="flex flex-col gap-4 border-t-2 border-rule bg-surface pt-4">
            <div className="flex items-start justify-between gap-4">
              <Link
                to={`/course/${course.id}`}
                className="text-xl font-bold leading-snug hover:underline"
              >
                {course.title}
              </Link>
              {onRemove && (
                <button
                  type="button"
                  className="-mr-2 -mt-2 min-h-11 shrink-0 px-2 text-sm text-muted hover:text-danger"
                  onClick={() => {
                    if (window.confirm(`Прибрати «${course.title}» з бібліотеки?`)) {
                      onRemove(course.id);
                    }
                  }}
                >
                  Прибрати
                </button>
              )}
            </div>
            <p className="text-sm text-muted">
              {stats.completedCount} з {stats.videoCount} уроків
            </p>
            <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
          </li>
        );
      })}
    </ul>
  );
}
