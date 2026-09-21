import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CoursePage } from './CoursePage';
import type { Course, ProgressMap } from '../types';

const course: Course = {
  id: 'c1',
  title: 'Курс',
  addedAt: 1,
  lastScannedAt: 1,
  tree: {
    id: 'c1',
    kind: 'folder',
    title: 'Курс',
    children: [
      {
        id: 'm1',
        kind: 'folder',
        title: '01 - Модуль перший',
        children: [
          {
            id: 'm1s1',
            kind: 'folder',
            title: '1 - Розділ',
            children: [
              { id: 'v1', kind: 'video', title: 'Перше.mp4', durationSec: 100 },
              { id: 'v2', kind: 'video', title: 'Друге.mp4', durationSec: 100 },
            ],
          },
        ],
      },
      { id: 'v3', kind: 'video', title: 'Окремий урок.mp4', durationSec: 200 },
    ],
  },
};

function renderPage(progress: ProgressMap = {}, onRescan = vi.fn(async () => {})) {
  render(
    <MemoryRouter>
      <CoursePage course={course} progress={progress} onRescan={onRescan} />
    </MemoryRouter>,
  );
  return { onRescan };
}

describe('CoursePage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Курс' })).toBeInTheDocument();
  });

  it('показує вкладені розділи', () => {
    renderPage();
    expect(screen.getByText('01 - Модуль перший')).toBeInTheDocument();
    expect(screen.getByText('1 - Розділ')).toBeInTheDocument();
  });

  it('показує уроки з посиланнями на плеєр', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Перше\.mp4/ })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v1',
    );
  });

  it('позначає переглянуті уроки', () => {
    renderPage({ v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 } });
    expect(screen.getByRole('link', { name: /Перше\.mp4/ })).toHaveTextContent('✓');
  });

  it('показує прогрес кожного розділу окремо', () => {
    renderPage({ v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 } });
    // Розділ: 100 з 200 с = 50%. Курс: 100 з 400 с = 25%.
    const bars = screen.getAllByRole('progressbar');
    const values = bars.map((b) => b.getAttribute('aria-valuenow'));
    expect(values).toContain('50');
    expect(values).toContain('25');
  });

  it('веде «продовжити» на перший урок нового курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /почати курс/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v1',
    );
  });

  it('веде «продовжити» на незавершений урок', () => {
    renderPage({
      v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 100 },
      v2: { positionSec: 30, durationSec: 100, completed: false, updatedAt: 500 },
    });
    expect(screen.getByRole('link', { name: /продовжити/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v2',
    );
  });

  it('пропонує оновити структуру курсу', async () => {
    const { onRescan } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /оновити структуру/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('показує причину, коли оновлення структури впало', async () => {
    // Раніше відхилення ковталося в App і кнопка просто нічого не робила.
    const onRescan = vi.fn(async () => {
      throw new Error('Папку не знайдено або до неї немає доступу.');
    });
    renderPage({}, onRescan);

    await userEvent.click(screen.getByRole('button', { name: /оновити структуру/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/немає доступу/i);
  });

  it('на курсі без відео не показує кнопку продовження', () => {
    const empty: Course = { ...course, tree: { ...course.tree, children: [] } };
    render(
      <MemoryRouter>
        <CoursePage course={empty} progress={{}} onRescan={vi.fn(async () => {})} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /продовжити|почати курс/i })).toBeNull();
    expect(screen.getByText(/не знайдено жодного відео/i)).toBeInTheDocument();
  });
});
