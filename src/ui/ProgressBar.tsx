export type ProgressBarProps = {
  /** 0..1 */
  ratio: number;
  /** Відсоток порахований за кількістю відео, а не за часом. */
  approximate?: boolean;
};

export function ProgressBar({ ratio, approximate = false }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, ratio));
  // Звичайне округлення, але 100% ніколи не показуємо, поки курс не завершено
  // насправді — 99,6% не має виглядати як завершений курс.
  const rounded = Math.round(clamped * 100);
  const percent = rounded >= 100 && clamped < 1 ? 99 : rounded;

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
      >
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-sm tabular-nums text-zinc-600">
        {approximate ? '≈' : ''}
        {percent}%
      </span>
    </div>
  );
}
