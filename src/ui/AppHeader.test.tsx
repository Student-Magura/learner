import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './AppHeader';

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
