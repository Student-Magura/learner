import { CheckIcon, PlayIcon } from './icons';

export type LessonState = 'completed' | 'started' | 'new';

const LABEL: Record<LessonState, string> = {
  completed: 'Переглянуто: ',
  started: 'Розпочато: ',
  new: 'Не розпочато: ',
};

export function LessonStatus({ state }: { state: LessonState }) {
  return (
    <>
      {state === 'completed' ? (
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center bg-primary text-on-primary"
        >
          <CheckIcon />
        </span>
      ) : state === 'started' ? (
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-accent text-accent"
        >
          <PlayIcon className="h-2.5 w-2.5" />
        </span>
      ) : (
        <span aria-hidden className="h-5 w-5 shrink-0 border-2 border-line" />
      )}
      {/* Значок суто декоративний, тому стан уроку дублюємо текстом: інакше
          читач екрана чує лише назву, без «переглянуто» чи «розпочато». */}
      <span className="sr-only">{LABEL[state]}</span>
    </>
  );
}
