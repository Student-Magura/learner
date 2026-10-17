import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export type ModalProps = {
  title: string;
  onClose(): void;
  children: ReactNode;
};

/**
 * Нативний <dialog> через showModal(): фокус-пастку, Esc і затемнення фону дає браузер.
 * Монтується вже відкритим — батько просто рендерить його або ні.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    // StrictMode запускає ефект двічі на тому самому вузлі: повторний showModal
    // на відкритому діалозі в старших браузерах кидає InvalidStateError.
    // close() у прибиранні не викликаємо: браузер сам закриває діалог, вилучений
    // з документа, а 'close' від прибирання в StrictMode закрив би щойно відкритий.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc: браузер закриває діалог сам і шле 'close' — батько знімає його з рендеру.
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-lg border-2 border-rule bg-surface p-6 text-fg shadow-[6px_6px_0_var(--rule)] backdrop:bg-black/50 sm:p-8"
    >
      <h2 id={titleId} className="mb-4 text-2xl font-extrabold tracking-tight">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
