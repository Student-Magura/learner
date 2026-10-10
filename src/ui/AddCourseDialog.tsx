import { useState } from 'react';
import { primaryButton } from './buttons';

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
      <label htmlFor="folder-url" className="text-sm font-semibold text-muted">
        Посилання на папку Google Drive
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="folder-url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          className="min-h-11 w-full border-2 border-rule bg-surface px-3 text-[15px] text-fg placeholder:text-muted"
        />
        <button type="submit" disabled={busy} className={`shrink-0 ${primaryButton}`}>
          {busy ? 'Сканую…' : 'Додати курс'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
