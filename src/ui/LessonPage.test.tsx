import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonPage } from './LessonPage';
import { CAPABILITY_STORAGE_KEY } from '../player/useMediaCapability';
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
      { id: 'v1', kind: 'video', title: 'Перше.mp4', durationSec: 100 },
      { id: 'v2', kind: 'video', title: 'Друге.mp4', durationSec: 100 },
      { id: 'v3', kind: 'video', title: 'Третє.mp4', durationSec: 100 },
    ],
  },
};

function renderLesson(videoId = 'v2', progress: ProgressMap = {}) {
  const props = {
    course,
    progress,
    videoId,
    onPosition: vi.fn(),
    onToggleCompleted: vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <LessonPage {...props} />
    </MemoryRouter>,
  );
  return { ...props, view };
}

beforeEach(() => localStorage.clear());

describe('LessonPage', () => {
  it('показує назву уроку', () => {
    renderLesson();
    expect(screen.getByRole('heading', { name: 'Друге.mp4' })).toBeInTheDocument();
  });

  it('за замовчуванням показує власний плеєр', () => {
    const { view } = renderLesson();
    expect(view.container.querySelector('video')).not.toBeNull();
    expect(view.container.querySelector('iframe')).toBeNull();
  });

  it('показує fallback, коли вердикт уже збережений', () => {
    localStorage.setItem(CAPABILITY_STORAGE_KEY, 'fallback');
    const { view } = renderLesson();
    expect(view.container.querySelector('iframe')).not.toBeNull();
    expect(view.container.querySelector('video')).toBeNull();
  });

  it('перемикається на fallback, коли плеєр не зміг завантажити відео', async () => {
    const { view } = renderLesson();
    const video = view.container.querySelector('video')!;
    video.dispatchEvent(new Event('error'));
    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(view.container.querySelector('video')).toBeNull();
  });

  it('дає посилання на попередній і наступний урок', () => {
    renderLesson('v2');
    expect(screen.getByRole('link', { name: /попередній/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v1',
    );
    expect(screen.getByRole('link', { name: /наступний/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v3',
    );
  });

  it('на першому уроці не показує «попередній»', () => {
    renderLesson('v1');
    expect(screen.queryByRole('link', { name: /попередній/i })).toBeNull();
  });

  it('на останньому уроці не показує «наступний»', () => {
    renderLesson('v3');
    expect(screen.queryByRole('link', { name: /наступний/i })).toBeNull();
  });

  it('дозволяє ручне перемикання «переглянуто» і в основному плеєрі', async () => {
    const props = renderLesson('v2');
    await userEvent.click(screen.getByRole('checkbox', { name: /переглянуто/i }));
    expect(props.onToggleCompleted).toHaveBeenCalledWith('v2', true);
  });

  it('знімає відмітку, якщо урок уже позначений', async () => {
    const props = renderLesson('v2', {
      v2: { positionSec: 99, durationSec: 100, completed: true, updatedAt: 1 },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /переглянуто/i }));
    expect(props.onToggleCompleted).toHaveBeenCalledWith('v2', false);
  });

  it('повідомляє, коли урок не знайдено в курсі', () => {
    renderLesson('немає-такого');
    expect(screen.getByText(/урок не знайдено/i)).toBeInTheDocument();
  });
});
