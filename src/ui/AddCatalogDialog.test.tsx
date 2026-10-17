import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddCatalogDialog, coursesLabel } from './AddCatalogDialog';
import type { CatalogPreview } from '../types';

const URL = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx';

const preview: CatalogPreview = {
  id: '1AbCdEfGhIjKlMnOpQrStUvWx',
  title: 'Команда дизайну',
  courses: ['Типографіка', 'Figma advanced', 'Дизайн-системи', 'Моушн', 'UX-письмо', 'Іконки', 'Колір'].map(
    (title, i) => ({ id: `course-${i}`, title }),
  ),
};

function renderDialog(over: Partial<Parameters<typeof AddCatalogDialog>[0]> = {}) {
  const props = {
    onPreview: vi.fn(async () => preview),
    onAdd: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...over,
  };
  render(<AddCatalogDialog {...props} />);
  return props;
}

async function toPreview() {
  await userEvent.type(screen.getByLabelText(/посилання на папку/i), URL);
  await userEvent.click(screen.getByRole('button', { name: 'Далі' }));
}

describe('AddCatalogDialog', () => {
  it('крок 1 питає посилання й веде до передперегляду', async () => {
    const props = renderDialog();
    expect(screen.getByRole('dialog', { name: 'Додати каталог курсів' })).toBeInTheDocument();

    await toPreview();

    expect(props.onPreview).toHaveBeenCalledWith(URL);
    expect(await screen.findByText('Команда дизайну')).toBeInTheDocument();
    expect(screen.getByText(/7 курсів/)).toBeInTheDocument();
  });

  it('передперегляд показує перші 5 курсів і скільки ще', async () => {
    renderDialog();
    await toPreview();
    expect(await screen.findByText('Типографіка')).toBeInTheDocument();
    expect(screen.getByText('UX-письмо')).toBeInTheDocument();
    expect(screen.queryByText('Іконки')).toBeNull();
    expect(screen.getByText('…ще 2')).toBeInTheDocument();
  });

  it('«Додати каталог» передає саме передперегляд і закриває діалог', async () => {
    const props = renderDialog();
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Додати каталог' }));
    expect(props.onAdd).toHaveBeenCalledWith(preview);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('«Назад» повертає до поля, зберігаючи введене', async () => {
    renderDialog();
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    expect(screen.getByLabelText(/посилання на папку/i)).toHaveValue(URL);
  });

  it('каталог без курсів не можна додати', async () => {
    renderDialog({ onPreview: vi.fn(async () => ({ ...preview, courses: [] })) });
    await toPreview();
    expect(await screen.findByText(/немає курсів-підпапок/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати каталог' })).toBeDisabled();
  });

  it('помилка передперегляду лишає на першому кроці', async () => {
    renderDialog({
      onPreview: vi.fn(async () => {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }),
    });
    await toPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в бібліотеці/);
    expect(screen.getByLabelText(/посилання на папку/i)).toHaveValue(URL);
  });

  it('помилка додавання показується, діалог лишається відкритим', async () => {
    const props = renderDialog({
      onAdd: vi.fn(async () => {
        throw new Error('Цей каталог уже є в бібліотеці.');
      }),
    });
    await toPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Додати каталог' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже є в бібліотеці/);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('coursesLabel', () => {
  it.each([
    [1, '1 курс'],
    [2, '2 курси'],
    [4, '4 курси'],
    [5, '5 курсів'],
    [11, '11 курсів'],
    [12, '12 курсів'],
    [21, '21 курс'],
    [22, '22 курси'],
    [0, '0 курсів'],
  ])('%i → %s', (n, label) => {
    expect(coursesLabel(n)).toBe(label);
  });
});
