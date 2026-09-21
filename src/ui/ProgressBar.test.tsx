import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('показує відсоток цілим числом', () => {
    render(<ProgressBar ratio={0.4567} />);
    expect(screen.getByText('46%')).toBeInTheDocument();
  });

  it('передає значення в ARIA для зчитувачів екрана', () => {
    render(<ProgressBar ratio={0.5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('не показує 100% на 99,6% — щоб не брехати про завершення', () => {
    render(<ProgressBar ratio={0.996} />);
    expect(screen.getByText('99%')).toBeInTheDocument();
  });

  it('показує 100% лише на повному завершенні', () => {
    render(<ProgressBar ratio={1} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('позначає приблизний відсоток', () => {
    render(<ProgressBar ratio={0.33} approximate />);
    expect(screen.getByText('≈33%')).toBeInTheDocument();
  });
});
