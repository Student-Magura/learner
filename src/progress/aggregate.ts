import { COMPLETION_THRESHOLD } from '../types';
import type { Course, ProgressMap, TreeNode, VideoNode } from '../types';

export type NodeProgress = {
  /** 0..1 */
  ratio: number;
  /**
   * true, коли жодне відео вузла не має відомої тривалості,
   * і відсоток порахований за кількістю переглянутих, а не за часом.
   */
  approximate: boolean;
  videoCount: number;
  completedCount: number;
};

/** Відео в порядку курсу: обхід у глибину, діти вже відсортовані сканером. */
export function flattenVideos(node: TreeNode): VideoNode[] {
  if (node.kind === 'video') return [node];
  return node.children.flatMap(flattenVideos);
}

/**
 * Тривалість із дерева, а якщо Drive її не віддав — та, яку повідомив плеєр.
 * null означає, що вона невідома з обох джерел.
 */
export function effectiveDuration(node: VideoNode, progress: ProgressMap): number | null {
  if (node.durationSec !== null) return node.durationSec;
  return progress[node.id]?.durationSec ?? null;
}

/** Внутрішній акумулятор: час рахується лише по відео з відомою тривалістю. */
type Totals = {
  watchedSec: number;
  knownSec: number;
  videoCount: number;
  completedCount: number;
};

function collect(node: TreeNode, progress: ProgressMap, into: Totals): void {
  if (node.kind === 'folder') {
    for (const child of node.children) collect(child, progress, into);
    return;
  }

  const record = progress[node.id];
  const completed = record?.completed === true;
  into.videoCount += 1;
  if (completed) into.completedCount += 1;

  const duration = effectiveDuration(node, progress);
  // Невідома тривалість — відео не входить у часовий дріб ані чисельником,
  // ані знаменником. Інакше переглянуте відео без тривалості дало б понад 100%.
  if (duration === null || duration <= 0) return;

  into.knownSec += duration;
  into.watchedSec += completed ? duration : Math.min(record?.positionSec ?? 0, duration);
}

export function aggregate(node: TreeNode, progress: ProgressMap): NodeProgress {
  const totals: Totals = { watchedSec: 0, knownSec: 0, videoCount: 0, completedCount: 0 };
  collect(node, progress, totals);

  if (totals.knownSec > 0) {
    return {
      ratio: totals.watchedSec / totals.knownSec,
      approximate: false,
      videoCount: totals.videoCount,
      completedCount: totals.completedCount,
    };
  }

  // Часовий дріб не визначений: або відео немає взагалі, або в жодного немає тривалості.
  return {
    ratio: totals.videoCount > 0 ? totals.completedCount / totals.videoCount : 0,
    approximate: totals.videoCount > 0,
    videoCount: totals.videoCount,
    completedCount: totals.completedCount,
  };
}

/** Автоматична відмітка потребує відомої тривалості — без неї лишається ручна. */
export function shouldAutoComplete(positionSec: number, durationSec: number | null): boolean {
  if (durationSec === null || durationSec <= 0) return false;
  return positionSec >= durationSec * COMPLETION_THRESHOLD;
}

/**
 * «Продовжити з місця зупинки». Окремого поля в моделі немає навмисно:
 * це запис із найбільшим updatedAt, тому вибір синхронізується між пристроями сам.
 * Якщо останнє переглянуте вже завершене — віддаємо наступне незавершене за ним.
 */
export function findResumeVideoId(course: Course, progress: ProgressMap): string | null {
  const videos = flattenVideos(course.tree);
  if (videos.length === 0) return null;

  let lastIndex = -1;
  let lastUpdatedAt = -Infinity;
  videos.forEach((v, index) => {
    const updatedAt = progress[v.id]?.updatedAt;
    if (updatedAt !== undefined && updatedAt > lastUpdatedAt) {
      lastUpdatedAt = updatedAt;
      lastIndex = index;
    }
  });

  if (lastIndex === -1) return videos[0]!.id;

  const last = videos[lastIndex]!;
  if (progress[last.id]?.completed !== true) return last.id;

  for (let i = lastIndex + 1; i < videos.length; i += 1) {
    const candidate = videos[i]!;
    if (progress[candidate.id]?.completed !== true) return candidate.id;
  }
  return last.id;
}
