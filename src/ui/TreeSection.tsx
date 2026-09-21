import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import { aggregate } from '../progress/aggregate';
import type { FolderNode, ProgressMap, TreeNode } from '../types';

export type TreeSectionProps = {
  node: FolderNode;
  courseId: string;
  progress: ProgressMap;
  depth?: number;
};

function LessonLink({
  node,
  courseId,
  progress,
}: {
  node: Extract<TreeNode, { kind: 'video' }>;
  courseId: string;
  progress: ProgressMap;
}) {
  const record = progress[node.id];
  const completed = record?.completed === true;
  const started = !completed && (record?.positionSec ?? 0) > 0;

  return (
    <Link
      to={`/course/${courseId}/lesson/${node.id}`}
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100"
    >
      <span
        aria-hidden
        className={completed ? 'text-emerald-600' : started ? 'text-amber-500' : 'text-zinc-300'}
      >
        {completed ? '✓' : started ? '◐' : '○'}
      </span>
      {/* Гліф суто декоративний, тому стан уроку дублюємо текстом: інакше
          читач екрана чує лише назву, без «переглянуто» чи «розпочато». */}
      <span className="sr-only">
        {completed ? 'Переглянуто: ' : started ? 'Розпочато: ' : 'Не розпочато: '}
      </span>
      <span className={completed ? 'text-zinc-500' : ''}>{node.title}</span>
    </Link>
  );
}

/**
 * Рекурсивний акордеон: глибина дерева не обмежена, бо курси в Drive
 * бувають і на один рівень вкладеності, і на три.
 */
export function TreeSection({ node, courseId, progress, depth = 0 }: TreeSectionProps) {
  const stats = aggregate(node, progress);

  return (
    <details open={depth < 1} className="rounded-lg border border-zinc-200">
      <summary className="cursor-pointer select-none px-3 py-2">
        <span className="font-medium">{node.title}</span>
        <div className="mt-2">
          <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
        </div>
      </summary>

      <div className="flex flex-col gap-1 border-t border-zinc-100 p-2">
        {node.children.map((child) =>
          child.kind === 'folder' ? (
            <TreeSection
              key={child.id}
              node={child}
              courseId={courseId}
              progress={progress}
              depth={depth + 1}
            />
          ) : (
            <LessonLink key={child.id} node={child} courseId={courseId} progress={progress} />
          ),
        )}
      </div>
    </details>
  );
}
