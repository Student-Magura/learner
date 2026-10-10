import { secondaryButton } from '../ui/buttons';

export type FallbackPlayerProps = {
  fileId: string;
  completed: boolean;
  onToggleCompleted(): void;
  /** Скидає збережений вердикт і повертає користувача на вбудований плеєр. */
  onRetryProxy?(): void;
};

/**
 * Відкіт для платформ, де медіа-проксі не працює. Плеєр Drive у iframe —
 * cross-origin, тому позиція й тривалість недоступні, і відмітка лишається ручною.
 */
export function FallbackPlayer({
  fileId,
  completed,
  onToggleCompleted,
  onRetryProxy,
}: FallbackPlayerProps) {
  return (
    <div className="flex flex-col gap-3">
      <iframe
        title="Відео курсу"
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        allow="autoplay"
        allowFullScreen
        className="aspect-video w-full bg-black"
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggleCompleted}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        Переглянуто
      </label>
      <p role="note" className="text-sm text-muted">
        На цьому пристрої відео показує плеєр Google Drive, тому позиція перегляду не зберігається —
        відмічайте уроки вручну.
        {onRetryProxy &&
          ' Якщо причина була тимчасова (немає мережі, збій Drive), можна повернутися до' +
            ' вбудованого плеєра застосунку.'}
      </p>
      {onRetryProxy && (
        <button type="button" onClick={onRetryProxy} className={`self-start ${secondaryButton}`}>
          Спробувати вбудований плеєр
        </button>
      )}
    </div>
  );
}
