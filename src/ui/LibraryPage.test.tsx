import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';
import type { Course, ProgressMap } from '../types';

const course: Course = {
  id: 'c1',
  title: 'Product Management',
  addedAt: 1,
  lastScannedAt: 1,
  tree: {
    id: 'c1',
    kind: 'folder',
    title: 'Product Management',
    children: [
      { id: 'v1', kind: 'video', title: 'Один.mp4', durationSec: 100 },
      { id: 'v2', kind: 'video', title: 'Два.mp4', durationSec: 100 },
    ],
  },
};

function renderPage(over: Partial<Parameters<typeof LibraryPage>[0]> = {}) {
  const props = {
    courses: [course],
    progress: {} as ProgressMap,
    onAddCourse: vi.fn(async () => {}),
    onRemoveCourse: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <LibraryPage {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('LibraryPage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Product Management/ })).toBeInTheDocument();
  });

  it('показує загальний прогрес курсу за часом', () => {
    renderPage({
      progress: {
        v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 },
      },
    });
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('показує кількість переглянутих уроків', () => {
    renderPage({
      progress: {
        v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 },
      },
    });
    expect(screen.getByText(/1 з 2/)).toBeInTheDocument();
  });

  it('на порожній бібліотеці пояснює, що робити', () => {
    renderPage({ courses: [] });
    expect(screen.getByText(/додайте перший курс/i)).toBeInTheDocument();
  });

  it('додає курс за введеним посиланням', async () => {
    const props = renderPage();
    await userEvent.type(
      screen.getByLabelText(/посилання на папку/i),
      'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk',
    );
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(props.onAddCourse).toHaveBeenCalledWith(
      'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk',
    );
  });

  it('показує помилку від onAddCourse, не ламаючи сторінку', async () => {
    renderPage({
      onAddCourse: vi.fn(async () => {
        throw new Error('Потрібне посилання на папку Google Drive або її ID');
      }),
    });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), 'сміття');
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/посилання на папку/i);
  });

  it('не викликає onAddCourse на порожньому полі', async () => {
    const props = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(props.onAddCourse).not.toHaveBeenCalled();
  });

  it('прибирає курс після підтвердження', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /прибрати/i }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('c1');
  });

  it('не прибирає курс, якщо підтвердження скасували', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /прибрати/i }));
    expect(props.onRemoveCourse).not.toHaveBeenCalled();
  });
});
