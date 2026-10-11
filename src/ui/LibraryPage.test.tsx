import { render, screen, within } from '@testing-library/react';
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
    catalogSyncing: false,
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

  describe('каталог', () => {
    const catalogCourse = (id: string, title: string): Course => ({
      ...course,
      id,
      title,
      source: 'catalog',
      tree: { ...course.tree, id, title },
    });

    it('показує курси каталогу й власні в окремих розділах', () => {
      renderPage({ courses: [course, catalogCourse('k1', 'Кібербезпека')] });

      const catalog = screen.getByRole('region', { name: 'Каталог' });
      const own = screen.getByRole('region', { name: 'Власні курси' });
      expect(within(catalog).getByRole('link', { name: 'Кібербезпека' })).toBeInTheDocument();
      expect(within(catalog).queryByRole('link', { name: 'Product Management' })).toBeNull();
      expect(within(own).getByRole('link', { name: 'Product Management' })).toBeInTheDocument();
    });

    it('курс каталогу не можна прибрати', () => {
      renderPage({ courses: [catalogCourse('k1', 'Кібербезпека')] });
      expect(screen.queryByRole('button', { name: /прибрати/i })).toBeNull();
    });

    it('впорядковує каталог за назвою природним порядком', () => {
      renderPage({
        courses: [catalogCourse('k10', '10 - Пізній'), catalogCourse('k2', '2 - Ранній')],
      });
      const links = within(screen.getByRole('region', { name: 'Каталог' })).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual(['2 - Ранній', '10 - Пізній']);
    });

    it('показує, що каталог оновлюється', () => {
      renderPage({ courses: [catalogCourse('k1', 'Кібербезпека')], catalogSyncing: true });
      expect(screen.getByRole('status')).toHaveTextContent(/оновлюємо каталог/i);
    });

    it('показує індикатор і тоді, коли каталог ще порожній', () => {
      renderPage({ courses: [], catalogSyncing: true });
      expect(screen.getByRole('status')).toHaveTextContent(/оновлюємо каталог/i);
    });

    it('не показує індикатор, коли оновлення закінчилось', () => {
      renderPage({ courses: [catalogCourse('k1', 'Кібербезпека')] });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('без курсів каталогу розділу каталогу немає', () => {
      renderPage({ courses: [course] });
      expect(screen.queryByRole('region', { name: 'Каталог' })).toBeNull();
    });
  });
});
