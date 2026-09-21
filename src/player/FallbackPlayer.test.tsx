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
    expect(screen.getByRole('note')).toHaveTextContent(/плеєр Google Drive/i);
    expect(screen.getByRole('note')).toHaveTextContent(/відмічайте уроки вручну/i);
  });

  it('чекбокс відображає стан «переглянуто»', () => {
    render(<FallbackPlayer fileId="f" completed onToggleCompleted={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /переглянуто/i })).toBeChecked();
  });

  it('дає повернутися до вбудованого плеєра, коли вихід передали', async () => {
    const onRetryProxy = vi.fn();
    render(
      <FallbackPlayer
        fileId="f"
        completed={false}
        onToggleCompleted={vi.fn()}
        onRetryProxy={onRetryProxy}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /спробувати вбудований плеєр/i }));
    expect(onRetryProxy).toHaveBeenCalledTimes(1);
  });

  it('без onRetryProxy кнопки немає', () => {
    render(<FallbackPlayer fileId="f" completed={false} onToggleCompleted={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('клік по чекбоксу повідомляє про перемикання', async () => {
    const onToggleCompleted = vi.fn();
    render(<FallbackPlayer fileId="f" completed={false} onToggleCompleted={onToggleCompleted} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /переглянуто/i }));
    expect(onToggleCompleted).toHaveBeenCalledTimes(1);
  });
});
