import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from './Modal';
import { folderInputClass } from './AddCourseDialog';
import { primaryButton, secondaryButton } from './buttons';
import type { CatalogPreview } from '../types';

export type AddCatalogDialogProps = {
  onPreview(input: string): Promise<CatalogPreview>;
  onAdd(preview: CatalogPreview): Promise<void>;
  onClose(): void;
};

/** Скільки назв курсів видно в передперегляді — решта як «…ще N». */
const PREVIEW_LIMIT = 5;

/** «1 курс», «2 курси», «5 курсів», «11 курсів», «21 курс». */
export function coursesLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} курс`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} курси`;
  return `${n} курсів`;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Не вдалося додати каталог';

/**
 * Два кроки: посилання → передперегляд → підтвердження. Передперегляд — це і є
 * захист від плутанини: побачивши «01 Вступ, 02 Основи…», людина зрозуміє,
 * що вставила курс, а не каталог.
 */
export function AddCatalogDialog({ onPreview, onAdd, onClose }: AddCatalogDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Кнопка, на яку переходить фокус на кроці 2: та, що фокусувалась, зникла з DOM.
  const addRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const onStepTwo = preview !== null;
  const emptyPreview = preview?.courses.length === 0;

  useEffect(() => {
    if (!onStepTwo) return;
    (emptyPreview ? backRef : addRef).current?.focus();
  }, [onStepTwo, emptyPreview]);

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      setPreview(await onPreview(trimmed));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(current: CatalogPreview) {
    setBusy(true);
    setError(null);
    try {
      await onAdd(current);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
      return;
    }
    onClose();
  }

  const errorLine = error && (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  );

  if (!preview) {
    return (
      <Modal title="Додати каталог курсів" onClose={onClose}>
        <form onSubmit={handlePreview} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Папка Drive, у якій кожна підпапка — окремий курс. Нові курси, які туди викладуть,
            зʼявлятимуться самі.
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
          {errorLine}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Скасувати
            </button>
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Шукаю…' : 'Далі'}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  const shown = preview.courses.slice(0, PREVIEW_LIMIT);
  const rest = preview.courses.length - shown.length;
  const empty = preview.courses.length === 0;

  return (
    <Modal title="Додати каталог курсів" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="truncate text-sm text-muted">{value.trim()}</p>
        <div className="border-t-2 border-rule pt-3">
          <p>
            <span className="font-bold">{preview.title}</span>
            {` · ${coursesLabel(preview.courses.length)}`}
          </p>
          {empty ? (
            <p className="mt-2 text-sm text-danger">У папці немає курсів-підпапок.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
              {shown.map((course) => (
                <li key={course.id}>{course.title}</li>
              ))}
              {rest > 0 && <li className="list-none text-muted">{`…ще ${rest}`}</li>}
            </ul>
          )}
        </div>
        {errorLine}
        <div className="flex justify-end gap-2">
          <button
            ref={backRef}
            type="button"
            onClick={() => {
              setPreview(null);
              setError(null);
            }}
            className={secondaryButton}
          >
            Назад
          </button>
          <button
            ref={addRef}
            type="button"
            disabled={busy || empty}
            onClick={() => void handleAdd(preview)}
            className={primaryButton}
          >
            {busy ? 'Додаю…' : 'Додати каталог'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
