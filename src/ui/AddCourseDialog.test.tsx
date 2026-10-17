import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddCourseDialog } from './AddCourseDialog';

const URL = 'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk';

function renderDialog(over: Partial<Parameters<typeof AddCourseDialog>[0]> = {}) {
  const props = { onSubmit: vi.fn(async () => {}), onClose: vi.fn(), ...over };
  render(<AddCourseDialog {...props} />);
  return props;
}

describe('AddCourseDialog', () => {
  it('відкривається модальним діалогом із полем посилання', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Додати курс' })).toBeInTheDocument();
    expect(screen.getByLabelText(/посилання на папку/i)).toBeInTheDocument();
  });

  it('додає курс і закривається', async () => {
    const props = renderDialog();
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(props.onSubmit).toHaveBeenCalledWith(URL);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('показує помилку й лишається відкритим', async () => {
    const props = renderDialog({
      onSubmit: vi.fn(async () => {
        throw new Error('Цей курс уже є в каталозі «Каталог 2 РІЦ».');
      }),
    });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в каталозі/);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Додати курс' })).toBeEnabled();
  });

  it('не викликає onSubmit на порожньому полі', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('«Скасувати» закриває без додавання', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('поки сканує, кнопка показує «Сканую…» і неактивна', async () => {
    renderDialog({ onSubmit: vi.fn(() => new Promise<void>(() => {})) });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Додати курс' }));
    expect(screen.getByRole('button', { name: 'Сканую…' })).toBeDisabled();
  });
});
