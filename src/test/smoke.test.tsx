import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('інструментарій', () => {
  it('рендерить застосунок у jsdom і бачить його вміст', () => {
    render(<App />);
    expect(screen.getByText('Learner')).toBeInTheDocument();
  });
});
