import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FallbackPlayer } from './FallbackPlayer';

describe('FallbackPlayer', () => {
  it('вбудовує штатний плеєр Drive', () => {
    const { container } = render(
      <FallbackPlayer fileId="file-1" completed={false} onToggleCompleted={vi.fn()} />,
    );
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://drive.google.com/file/d/file-1/preview',
    );
  });

  it('пояснює, чому відмітка ручна', () => {
    render(<FallbackPlayer fileId="f" completed={false} onToggleCompleted={vi.fn()} />);
    expect(screen.getByRole('note')).toHaveTextContent(/вбудований плеєр Google Drive/i);
  });

  it('чекбокс відображає стан «переглянуто»', () => {
    render(<FallbackPlayer fileId="f" completed onToggleCompleted={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /переглянуто/i })).toBeChecked();
  });

  it('клік по чекбоксу повідомляє про перемикання', async () => {
    const onToggleCompleted = vi.fn();
    render(<FallbackPlayer fileId="f" completed={false} onToggleCompleted={onToggleCompleted} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /переглянуто/i }));
    expect(onToggleCompleted).toHaveBeenCalledTimes(1);
  });
});
