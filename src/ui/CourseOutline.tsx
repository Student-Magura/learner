import { Link } from 'react-router-dom';
import { LessonStatus, type LessonState } from './LessonStatus';
import { lessonTitle } from './lessonTitle';
import { aggregate } from '../progress/aggregate';
import type { FolderNode, ProgressMap, TreeNode, VideoNode } from '../types';

export type CourseOutlineProps = {
  root: FolderNode;
  courseId: string;
  progress: ProgressMap;
  /** Урок, що зараз відкритий: підсвічуємо його в програмі. */
  currentVideoId?: string;
};

function lessonState(node: VideoNode, progress: ProgressMap): LessonState {
  const record = progress[node.id];
  if (record?.completed === true) return 'completed';
  return (record?.positionSec ?? 0) > 0 ? 'started' : 'new';
}

function formatDuration(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return null;
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function LessonRow({
  node,
  courseId,
  progress,
  current,
}: {
  node: VideoNode;
  courseId: string;
  progress: ProgressMap;
  current: boolean;
}) {
  const state = lessonState(node, progress);
  const duration = formatDuration(node.durationSec ?? progress[node.id]?.durationSec ?? null);

  return (
    <Link
      to={`/course/${courseId}/lesson/${node.id}`}
      aria-current={current ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-soft ${
        current ? 'bg-soft font-semibold' : ''
      }`}
    >
      <LessonStatus state={state} />
      <span
        className={`flex-1 leading-snug ${state === 'completed' && !current ? 'text-muted' : ''}`}
      >
        {lessonTitle(node.title)}
      </span>
      {duration && (
        <span className="shrink-0 text-xs tabular-nums text-muted">
          <span className="sr-only">, </span>
          {duration}
        </span>
      )}
    </Link>
  );
}

function Section({
  node,
  depth,
  ...rest
}: Omit<CourseOutlineProps, 'root'> & { node: FolderNode; depth: number }) {
  const stats = aggregate(node, rest.progress);
  return (
    <section className={depth === 0 ? 'border-t border-line pb-2 pt-4' : 'pt-2'}>
      <div className="flex items-baseline gap-3 px-4 pb-2">
        <h3
          className={`flex-1 ${depth === 0 ? 'text-[15px] font-bold' : 'text-sm font-semibold text-muted'}`}
        >
          {node.title}
        </h3>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
          {stats.completedCount}/{stats.videoCount}
        </span>
      </div>
      <Children nodes={node.children} depth={depth + 1} {...rest} />
    </section>
  );
}

function Children({
  nodes,
  depth,
  ...rest
}: Omit<CourseOutlineProps, 'root'> & { nodes: TreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((child) =>
        child.kind === 'folder' ? (
          <Section key={child.id} node={child} depth={depth} {...rest} />
        ) : (
          <LessonRow
            key={child.id}
            node={child}
            courseId={rest.courseId}
            progress={rest.progress}
            current={child.id === rest.currentVideoId}
          />
        ),
      )}
    </>
  );
}

/**
 * Програма курсу одним списком: розділи з лічильником «переглянуто/усього»,
 * уроки зі станом і тривалістю. Глибина вкладеності не обмежена.
 */
export function CourseOutline({ root, ...rest }: CourseOutlineProps) {
  // Відео просто в корені курсу збираємо в синтетичний розділ.
  const looseVideos = root.children.filter((c): c is VideoNode => c.kind === 'video');
  const folders = root.children.filter((c): c is FolderNode => c.kind === 'folder');

  return (
    <div>
      {looseVideos.length > 0 && (
        <Section
          node={{
            id: `section-${root.id}`,
            kind: 'folder',
            title: 'Без розділу',
            children: looseVideos,
          }}
          depth={0}
          {...rest}
        />
      )}
      {folders.map((folder) => (
        <Section key={folder.id} node={folder} depth={0} {...rest} />
      ))}
    </div>
  );
}
