import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppHeader, ThemeToggle } from './AppHeader';
import { WelcomeCard } from './WelcomeCard';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('ThemeToggle', () => {
  it('перемикає тему й запам’ятовує вибір', async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Темна тема' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('learner-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Світла тема' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('learner-theme')).toBe('light');
  });
});

describe('HelpButton', () => {
  it('знову показує закриту вітальну картку й веде на головну', async () => {
    // jsdom не вміє прокручувати.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/course/c1']}>
        <AppHeader />
        <Routes>
          <Route path="/" element={<WelcomeCard />} />
          <Route path="/course/c1" element={<p>Сторінка курсу</p>} />
        </Routes>
      </MemoryRouter>,
    );
    localStorage.setItem('learner-welcome-dismissed', '1');

    await userEvent.click(screen.getByRole('button', { name: 'Як це працює' }));

    expect(screen.queryByText('Сторінка курсу')).toBeNull();
    expect(screen.getByRole('region', { name: 'Як працює Learner' })).toBeInTheDocument();
  });
});
