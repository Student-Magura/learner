import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';
import type { CatalogSection, CourseSlot, Section } from '../library/sections';
import type { Course, ProgressMap } from '../types';

function makeCourse(id: string, title: string): Course {
  return {
    id,
    title,
    addedAt: 1,
    lastScannedAt: 1,
    tree: {
      id,
      kind: 'folder',
      title,
      children: [
        { id: `${id}-v1`, kind: 'video', title: 'Один.mp4', durationSec: 100 },
        { id: `${id}-v2`, kind: 'video', title: 'Два.mp4', durationSec: 100 },
      ],
    },
  };
}

const course = makeCourse('c1', 'Product Management');
const ready = (c: Course): CourseSlot => ({ kind: 'ready', course: c });

function catalog(over: Partial<CatalogSection> = {}): CatalogSection {
  return {
    kind: 'catalog',
    id: 'team-catalog',
    title: 'Команда дизайну',
    builtin: false,
    status: null,
    busy: false,
    ready: 1,
    slots: [ready(makeCourse('t1', 'Типографіка'))],
    ...over,
  };
}

const own = (slots: CourseSlot[] = [ready(course)]): Section => ({ kind: 'own', slots });

function renderPage(over: Partial<Parameters<typeof LibraryPage>[0]> = {}) {
  const props = {
    sections: [own()] as Section[],
    progress: {} as ProgressMap,
    onAddCourse: vi.fn(async () => {}),
    onPreviewCatalog: vi.fn(async () => ({ id: 'x', title: 'X', courses: [] })),
    onAddCatalog: vi.fn(async () => {}),
    onRemoveCourse: vi.fn(),
    onRemoveCatalog: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <LibraryPage {...props} />
    </MemoryRouter>,
  );
  return props;
}

beforeEach(() => localStorage.clear());

const watched = { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 };

describe('LibraryPage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Product Management/ })).toBeInTheDocument();
  });

  it('показує загальний прогрес курсу за часом', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('показує кількість переглянутих уроків', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByText(/1 з 2/)).toBeInTheDocument();
  });

  it('пропонує продовжити курс, який дивилися останнім', () => {
    renderPage({ progress: { 'c1-v1': watched } });
    expect(screen.getByRole('link', { name: /дивитись далі/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/c1-v2',
    );
  });

  it('вітальна картка пояснює, що можна додати свій курс чи каталог', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Як працює Learner' });
    expect(within(card).getByText(/одна папка з відео/i)).toBeInTheDocument();
    expect(within(card).getByText(/кожна підпапка — окремий курс/i)).toBeInTheDocument();
  });

  it('закрита вітальна картка не повертається після перезавантаження', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Закрити пояснення' }));
    expect(screen.queryByRole('region', { name: 'Як працює Learner' })).toBeNull();

    cleanup();
    renderPage();
    expect(screen.queryByRole('region', { name: 'Як працює Learner' })).toBeNull();
  });

  it('без власних курсів секція є й запрошує додати свій курс', async () => {
    renderPage({ sections: [] });
    const mine = screen.getByRole('region', { name: 'Власні курси' });
    expect(within(mine).getByText(/ваші курси з google drive/i)).toBeInTheDocument();

    await userEvent.click(within(mine).getByRole('button', { name: '+ Курс' }));
    expect(screen.getByRole('dialog', { name: 'Додати курс' })).toBeInTheDocument();
  });

  it('запрошення пропонує й каталог курсів', async () => {
    renderPage({ sections: [] });
    const mine = screen.getByRole('region', { name: 'Власні курси' });
    await userEvent.click(within(mine).getByRole('button', { name: 'каталог курсів' }));
    expect(screen.getByRole('dialog', { name: 'Додати каталог курсів' })).toBeInTheDocument();
  });

  it('коли власні курси є, запрошення лишається останньою плиткою', async () => {
    renderPage();
    const mine = screen.getByRole('region', { name: 'Власні курси' });
    await userEvent.click(within(mine).getByRole('button', { name: '+ Додати свій курс' }));
    expect(screen.getByRole('dialog', { name: 'Додати курс' })).toBeInTheDocument();
  });

  it('на головному екрані немає поля для посилання', () => {
    renderPage();
    expect(screen.queryByLabelText(/посилання на папку/i)).toBeNull();
  });

  it('«+ Курс» відкриває діалог, додає курс і закриває діалог', async () => {
    const props = renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Курс' }));
    const dialog = screen.getByRole('dialog', { name: 'Додати курс' });
    await userEvent.type(within(dialog).getByLabelText(/посилання на папку/i), 'abcdefghijklmnopqrstuvwxyz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Додати курс' }));
    expect(props.onAddCourse).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«+ Каталог» відкриває діалог каталогу', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Каталог' }));
    expect(screen.getByRole('dialog', { name: 'Додати каталог курсів' })).toBeInTheDocument();
  });

  it('кожен каталог — окрема секція з назвою папки, власні — окремо', () => {
    renderPage({
      sections: [
        catalog({ id: 'builtin', title: 'Каталог 2 РІЦ', builtin: true, slots: [ready(makeCourse('b1', 'Основи UX'))] }),
        catalog(),
        own(),
      ],
    });
    const builtin = screen.getByRole('region', { name: 'Каталог 2 РІЦ' });
    const team = screen.getByRole('region', { name: 'Команда дизайну' });
    const mine = screen.getByRole('region', { name: 'Власні курси' });
    expect(within(builtin).getByRole('link', { name: 'Основи UX' })).toBeInTheDocument();
    expect(within(team).getByRole('link', { name: 'Типографіка' })).toBeInTheDocument();
    expect(within(mine).getByRole('link', { name: 'Product Management' })).toBeInTheDocument();
  });

  it('вбудований каталог підписаний «для всіх» і не має меню', () => {
    renderPage({ sections: [catalog({ builtin: true, title: 'Каталог 2 РІЦ' })] });
    const region = screen.getByRole('region', { name: 'Каталог 2 РІЦ' });
    expect(within(region).getByText('для всіх')).toBeInTheDocument();
    expect(within(region).queryByLabelText(/дії з каталогом/i)).toBeNull();
  });

  it('меню доданого каталогу веде в Drive', async () => {
    renderPage({ sections: [catalog()] });
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    expect(screen.getByRole('link', { name: /відкрити в drive/i })).toHaveAttribute(
      'href',
      'https://drive.google.com/drive/folders/team-catalog',
    );
  });

  describe('меню каталогу закривається', () => {
    const menu = () => screen.getByLabelText('Дії з каталогом «Команда дизайну»').closest('details');

    async function open() {
      renderPage({ sections: [catalog()] });
      await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
      expect(menu()).toHaveAttribute('open');
    }

    it('має роль кнопки', () => {
      renderPage({ sections: [catalog()] });
      expect(screen.getByRole('button', { name: 'Дії з каталогом «Команда дизайну»' })).toBeInTheDocument();
    });

    it('на Escape', async () => {
      await open();
      await userEvent.keyboard('{Escape}');
      expect(menu()).not.toHaveAttribute('open');
    });

    it('після «Відкрити в Drive»', async () => {
      await open();
      await userEvent.click(screen.getByRole('link', { name: /відкрити в drive/i }));
      expect(menu()).not.toHaveAttribute('open');
    });

    it('після «Прибрати каталог», навіть якщо підтвердження скасували', async () => {
      await open();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await userEvent.click(screen.getByRole('button', { name: 'Прибрати каталог' }));
      expect(menu()).not.toHaveAttribute('open');
    });

    it('на клік поза меню', async () => {
      await open();
      await userEvent.click(document.body);
      expect(menu()).not.toHaveAttribute('open');
    });
  });

  it('безіменна картка в очікуванні питає про «Без назви», а не про порожні лапки', async () => {
    renderPage({
      sections: [own([{ kind: 'pending', id: 'p1', title: '', status: null }])],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(confirm).toHaveBeenCalledWith('Прибрати «Без назви» з бібліотеки?');
  });

  it('меню прибирає каталог після підтвердження', async () => {
    const props = renderPage({ sections: [catalog()] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати каталог' }));
    expect(props.onRemoveCatalog).toHaveBeenCalledWith('team-catalog');
  });

  it('не прибирає каталог, якщо підтвердження скасували', async () => {
    const props = renderPage({ sections: [catalog()] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByLabelText('Дії з каталогом «Команда дизайну»'));
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати каталог' }));
    expect(props.onRemoveCatalog).not.toHaveBeenCalled();
  });

  it('курси каталогу поштучно не прибираються', () => {
    renderPage({ sections: [catalog()] });
    const region = screen.getByRole('region', { name: 'Команда дизайну' });
    expect(within(region).queryByRole('button', { name: 'Прибрати' })).toBeNull();
  });

  it('власний курс прибирається після підтвердження', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('c1');
  });

  it('не прибирає власний курс, якщо підтвердження скасували', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).not.toHaveBeenCalled();
  });

  it('показує, що каталог оновлюється, з лічильником', () => {
    renderPage({
      sections: [
        catalog({
          busy: true,
          ready: 1,
          slots: [
            ready(makeCourse('t1', 'Типографіка')),
            { kind: 'pending', id: 't2', title: 'Моушн', status: 'scanning' },
          ],
        }),
      ],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Оновлюємо… 1 з 2');
  });

  it('без доступу до каталогу попереджає, але показує збережене', () => {
    renderPage({ sections: [catalog({ status: 'no-access' })] });
    expect(screen.getByText(/немає доступу до каталогу/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Типографіка' })).toBeInTheDocument();
  });

  it.each([
    ['scanning', 'Скануємо…'],
    ['no-access', 'Немає доступу до папки'],
    ['failed', 'Не вдалося завантажити — спробуємо пізніше'],
    [null, 'Ще не завантажено'],
  ] as const)('картка курсу без дерева, статус %s', (status, text) => {
    renderPage({
      sections: [catalog({ slots: [{ kind: 'pending', id: 't2', title: 'Моушн', status }] })],
    });
    expect(screen.getByText('Моушн')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Моушн' })).toBeNull();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('власний курс без доступу можна прибрати', async () => {
    const props = renderPage({
      sections: [own([{ kind: 'pending', id: 'gone', title: 'Старий курс', status: 'no-access' }])],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('gone');
  });
});
