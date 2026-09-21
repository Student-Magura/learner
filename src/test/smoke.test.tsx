import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('інструментарій', () => {
  it('рендерить застосунок у jsdom і бачить його вміст', () => {
    // App ініціалізує сервіси асинхронно, тож одразу після рендеру видно
    // лише екран завантаження — це і є мінімальна перевірка, що інструментарій
    // здатен змонтувати реальний App без падіння.
    render(<App />);
    expect(screen.getByText('Завантаження…')).toBeInTheDocument();
  });
});
