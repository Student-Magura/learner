import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddCatalogDialog } from './AddCatalogDialog';
import { AddCourseDialog } from './AddCourseDialog';
import { ProgressBar } from './ProgressBar';
import { WelcomeCard } from './WelcomeCard';
import { primaryButton, secondaryButton } from './buttons';
import { PlayIcon } from './icons';
import { lessonTitle } from './lessonTitle';
import { aggregate, findResumeVideoId, flattenVideos } from '../progress/aggregate';
import type { CatalogSection, CourseSlot, CourseStatus, OwnSection, Section } from '../library/sections';
import type { CatalogPreview, Course, ProgressMap } from '../types';

export type LibraryPageProps = {
  sections: Section[];
  progress: ProgressMap;
  onAddCourse(input: string): Promise<void>;
  onPreviewCatalog(input: string): Promise<CatalogPreview>;
  onAddCatalog(preview: CatalogPreview): Promise<void>;
  onRemoveCourse(id: string): void;
  onRemoveCatalog(id: string): void;
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

/** Відскановані курси з усіх секцій, без повторів: курс може бути у двох каталогах. */
function visibleCourses(sections: Section[]): Course[] {
  const byId = new Map<string, Course>();
  for (const section of sections) {
    for (const slot of section.slots) {
      if (slot.kind === 'ready') byId.set(slot.course.id, slot.course);
    }
  }
  return [...byId.values()];
}

export function LibraryPage({
  sections,
  progress,
  onAddCourse,
  onPreviewCatalog,
  onAddCatalog,
  onRemoveCourse,
  onRemoveCatalog,
}: LibraryPageProps) {
  const [dialog, setDialog] = useState<'course' | 'catalog' | null>(null);
  const resume = findContinue(visibleCourses(sections), progress);
  // «Власні курси» видно завжди: порожня секція — це запрошення додати свою папку з Drive.
  const own = sections.find((s): s is OwnSection => s.kind === 'own') ?? { kind: 'own', slots: [] };

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Мої курси</h1>
        {/* Курс додають частіше — він основна дія; на телефоні обидві кнопки ділять ширину. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDialog('catalog')}
            className={`flex-1 sm:flex-none ${secondaryButton}`}
          >
            + Каталог
          </button>
          <button
            type="button"
            onClick={() => setDialog('course')}
            className={`flex-1 sm:flex-none ${primaryButton}`}
          >
            + Курс
          </button>
        </div>
      </div>

      <WelcomeCard />

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

      {sections.map(
        (section) =>
          section.kind === 'catalog' && (
            <CatalogBlock
              key={section.id}
              section={section}
              progress={progress}
              onRemove={onRemoveCatalog}
            />
          ),
      )}

      <section aria-labelledby="own-heading" className="flex flex-col gap-6">
        <h2 id="own-heading" className="text-2xl font-extrabold tracking-tight">
          Власні курси
        </h2>
        <CourseGrid slots={own.slots} progress={progress} onRemove={onRemoveCourse}>
          <InviteTile
            compact={own.slots.length > 0}
            onAddCourse={() => setDialog('course')}
            onAddCatalog={() => setDialog('catalog')}
          />
        </CourseGrid>
      </section>

      {dialog === 'course' && (
        <AddCourseDialog onSubmit={onAddCourse} onClose={() => setDialog(null)} />
      )}
      {dialog === 'catalog' && (
        <AddCatalogDialog
          onPreview={onPreviewCatalog}
          onAdd={onAddCatalog}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}

function CatalogBlock({
  section,
  progress,
  onRemove,
}: {
  section: CatalogSection;
  progress: ProgressMap;
  onRemove(id: string): void;
}) {
  const headingId = `catalog-${section.id}`;
  const total = section.slots.length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-2xl font-extrabold tracking-tight">
          {section.title}
        </h2>
        {section.builtin && <span className="text-sm text-muted">для всіх</span>}
        {section.status === 'no-access' ? (
          <p className="text-sm font-semibold text-danger">
            ⚠ Немає доступу до каталогу — показуємо збережене
          </p>
        ) : (
          section.busy && (
            <p role="status" className="animate-pulse text-sm text-muted">
              {total > 0 ? `Оновлюємо… ${section.ready} з ${total}` : 'Оновлюємо…'}
            </p>
          )
        )}
        {!section.builtin && (
          <CatalogMenu section={section} onRemove={onRemove} />
        )}
      </div>
      {total > 0 && <CourseGrid slots={section.slots} progress={progress} />}
    </section>
  );
}

/** Меню «⋯» каталогу: <details> сам не закривається ні кліком поза собою, ні Escape, ні вибором пункту. */
function CatalogMenu({ section, onRemove }: { section: CatalogSection; onRemove(id: string): void }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative ml-auto">
      <summary
        role="button"
        aria-label={`Дії з каталогом «${section.title}»`}
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center text-xl hover:bg-soft [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div
        className="absolute right-0 z-10 mt-1 flex min-w-56 flex-col border-2 border-rule bg-surface shadow-[4px_4px_0_var(--rule)]"
        onClick={() => ref.current?.removeAttribute('open')}
      >
        <a
          href={`https://drive.google.com/drive/folders/${section.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 px-4 py-3 text-sm hover:bg-soft"
        >
          Відкрити в Drive ↗
        </a>
        <button
          type="button"
          className="min-h-11 px-4 py-3 text-left text-sm text-danger hover:bg-soft"
          onClick={() => {
            if (
              window.confirm(
                `Прибрати каталог «${section.title}» з бібліотеки? Прогрес перегляду збережеться.`,
              )
            ) {
              onRemove(section.id);
            }
          }}
        >
          Прибрати каталог
        </button>
      </div>
    </details>
  );
}

/** Без onRemove картки не мають кнопки «Прибрати» — так виглядають курси каталогу. */
function CourseGrid({
  slots,
  progress,
  onRemove,
  children,
}: {
  slots: CourseSlot[];
  progress: ProgressMap;
  onRemove?(id: string): void;
  /** Додаткова плитка в кінці сітки — запрошення додати курс. */
  children?: React.ReactNode;
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot) =>
        slot.kind === 'ready' ? (
          <CourseCard key={slot.course.id} course={slot.course} progress={progress} onRemove={onRemove} />
        ) : (
          <PendingCard
            key={slot.id}
            id={slot.id}
            title={slot.title}
            status={slot.status}
            onRemove={onRemove}
          />
        ),
      )}
      {children}
    </ul>
  );
}

/** Плитка-запрошення у «Власних курсах»: велика, поки секція порожня, далі — скромна. */
function InviteTile({
  compact,
  onAddCourse,
  onAddCatalog,
}: {
  compact: boolean;
  onAddCourse(): void;
  onAddCatalog(): void;
}) {
  if (compact) {
    return (
      <li className="flex">
        <button
          type="button"
          onClick={onAddCourse}
          className="min-h-24 flex-1 border-2 border-dashed border-line text-[15px] font-semibold text-muted hover:border-rule hover:text-fg"
        >
          + Додати свій курс
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-col items-start gap-3 border-2 border-dashed border-line p-6 sm:col-span-2">
      <span className="text-xl font-bold leading-snug">Ваші курси з Google Drive</span>
      <p className="text-sm text-muted">
        Вставте посилання на папку з відео — і вона зʼявиться тут із прогресом.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onAddCourse} className={primaryButton}>
          + Курс
        </button>
        <span className="text-sm text-muted">
          або{' '}
          <button
            type="button"
            onClick={onAddCatalog}
            className="min-h-11 font-semibold text-fg underline underline-offset-4 hover:no-underline"
          >
            каталог курсів
          </button>
        </span>
      </div>
    </li>
  );
}

function RemoveButton({ id, title, onRemove }: { id: string; title: string; onRemove(id: string): void }) {
  return (
    <button
      type="button"
      className="-mr-2 -mt-2 min-h-11 shrink-0 px-2 text-sm text-muted hover:text-danger"
      onClick={() => {
        if (window.confirm(`Прибрати «${title}» з бібліотеки?`)) onRemove(id);
      }}
    >
      Прибрати
    </button>
  );
}

function CourseCard({
  course,
  progress,
  onRemove,
}: {
  course: Course;
  progress: ProgressMap;
  onRemove?(id: string): void;
}) {
  const stats = aggregate(course.tree, progress);
  return (
    <li className="flex flex-col gap-4 border-t-2 border-rule bg-surface pt-4">
      <div className="flex items-start justify-between gap-4">
        <Link to={`/course/${course.id}`} className="text-xl font-bold leading-snug hover:underline">
          {course.title}
        </Link>
        {onRemove && <RemoveButton id={course.id} title={course.title} onRemove={onRemove} />}
      </div>
      <p className="mt-auto text-sm text-muted">
        {stats.completedCount} з {stats.videoCount} уроків
      </p>
      <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
    </li>
  );
}

const PENDING_TEXT: Record<CourseStatus | 'none', string> = {
  scanning: 'Скануємо…',
  'no-access': 'Немає доступу до папки',
  failed: 'Не вдалося завантажити — спробуємо пізніше',
  none: 'Ще не завантажено',
};

/** Курс, дерева якого ще немає: відомий лише за назвою. Не клікабельний. */
function PendingCard({
  id,
  title,
  status,
  onRemove,
}: {
  id: string;
  title: string;
  status: CourseStatus | null;
  onRemove?(id: string): void;
}) {
  return (
    <li className="flex flex-col gap-4 border-t-2 border-line pt-4 text-muted">
      <div className="flex items-start justify-between gap-4">
        <span className="text-xl font-bold leading-snug">{title || 'Без назви'}</span>
        {onRemove && <RemoveButton id={id} title={title || 'Без назви'} onRemove={onRemove} />}
      </div>
      <p
        className={`text-sm ${status === 'no-access' ? 'text-danger' : ''} ${
          status === 'scanning' ? 'animate-pulse' : ''
        }`}
      >
        {PENDING_TEXT[status ?? 'none']}
      </p>
    </li>
  );
}
