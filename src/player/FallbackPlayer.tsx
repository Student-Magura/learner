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
        className="aspect-video w-full rounded-lg bg-black"
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggleCompleted}
          className="h-4 w-4"
        />
        Переглянуто
      </label>
      <p role="note" className="text-sm text-zinc-500">
        На цьому пристрої відео показує плеєр Google Drive, тому позиція перегляду не
        зберігається — відмічайте уроки вручну.
        {onRetryProxy &&
          ' Якщо причина була тимчасова (немає мережі, збій Drive), можна повернутися до' +
            ' вбудованого плеєра застосунку.'}
      </p>
      {onRetryProxy && (
        <button
          type="button"
          onClick={onRetryProxy}
          className="self-start rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          Спробувати вбудований плеєр
        </button>
      )}
    </div>
  );
}
