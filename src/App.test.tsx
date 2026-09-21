import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { openLearnerDb } from './storage/db';
import { COURSE_LISTING, ROOT_FILE } from './test/fixtures/driveCourse';
import type { DriveApi } from './drive/api';
import type { SyncEngine } from './storage/syncEngine';
import type { ProgressMap } from './types';

const hoisted = vi.hoisted(() => ({ createServices: vi.fn() }));
vi.mock('./app/services', () => ({ createServices: hoisted.createServices }));

let sync: SyncEngine;
let counter = 0;

function fakeApi(): DriveApi {
  return {
    listFolder: vi.fn(async (id: string) => COURSE_LISTING[id] ?? []),
    getFile: vi.fn(async () => ROOT_FILE),
    statAppData: vi.fn(async () => null),
    readAppData: vi.fn(async () => null),
    writeAppData: vi.fn(async () => ({ modifiedTime: '' })),
  };
}

beforeEach(async () => {
  counter += 1;
  const db = await openLearnerDb(`app-test-${counter}`);
  sync = {
    syncNow: vi.fn(async (): Promise<ProgressMap> => ({})),
    scheduleSync: vi.fn(),
    flush: vi.fn(async () => {}),
  };
  hoisted.createServices.mockImplementation(async () => ({
    db,
    api: fakeApi(),
    sync,
    refreshToken: vi.fn(async () => {}),
    tokenClient: {
      signIn: vi.fn(async () => 'tok'),
      getToken: vi.fn(async () => 'tok'),
      signOut: vi.fn(),
      // Застосунок стартує вже з дійсним токеном: нас цікавить вміст, а не вхід.
      onChange: (cb: (signedIn: boolean) => void) => {
        cb(true);
        return () => {};
      },
    },
  }));
});

async function renderApp() {
  const view = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole('heading', { name: /мої курси/i })).toBeTruthy());
  return view;
}

describe('App', () => {
  it('піднімає сервіси й показує бібліотеку', async () => {
    await renderApp();
    expect(hoisted.createServices).toHaveBeenCalledTimes(1);
  });

  it('форсує синхронізацію на pagehide', async () => {
    // Дебоунс 10 с не переживає закриття вкладки: без цього все, записане в
    // останні секунди, лежало б у IndexedDB до наступного відкриття пристрою.
    await renderApp();
    (sync.flush as ReturnType<typeof vi.fn>).mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(sync.flush).toHaveBeenCalledTimes(1);
  });

  it('синхронізує, коли вкладка повертається у фокус', async () => {
    await renderApp();
    (sync.syncNow as ReturnType<typeof vi.fn>).mockClear();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it('прибирає слухачів після демонтажу', async () => {
    const view = await renderApp();
    view.unmount();
    (sync.flush as ReturnType<typeof vi.fn>).mockClear();
    (sync.syncNow as ReturnType<typeof vi.fn>).mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(sync.flush).not.toHaveBeenCalled();
    expect(sync.syncNow).not.toHaveBeenCalled();
  });

  it('показує людський текст, коли запуск сервісів упав', async () => {
    hoisted.createServices.mockImplementation(async () => {
      throw new Error('Не вдалося завантажити Google Sign-In (accounts.google.com).');
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Google Sign-In/)).toBeInTheDocument();
  });
});
