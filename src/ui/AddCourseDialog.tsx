import { useState } from 'react';

export type AddCourseDialogProps = {
  onSubmit(input: string): Promise<void>;
};

export function AddCourseDialog({ onSubmit }: AddCourseDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося додати курс');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="folder-url" className="text-sm font-medium">
        Посилання на папку Google Drive
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="folder-url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Сканую…' : 'Додати курс'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
