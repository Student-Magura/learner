import { useId, useState } from 'react';
import { Modal } from './Modal';
import { primaryButton, secondaryButton } from './buttons';

export type AddCourseDialogProps = {
  onSubmit(input: string): Promise<void>;
  onClose(): void;
};

export const folderInputClass =
  'min-h-11 w-full border-2 border-rule bg-surface px-3 text-[15px] text-fg placeholder:text-muted';

export function AddCourseDialog({ onSubmit, onClose }: AddCourseDialogProps) {
  const inputId = useId();
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося додати курс');
      setBusy(false);
      return;
    }
    // Успіх знімає діалог з рендеру — стан після цього вже не оновлюємо.
    onClose();
  }

  return (
    <Modal title="Додати курс" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Папка Google Drive, у якій лежать відео курсу, можна з підпапками-розділами.
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-semibold text-muted">
            Посилання на папку Google Drive
          </label>
          <input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className={folderInputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Скасувати
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Сканую…' : 'Додати курс'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
