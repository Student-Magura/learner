# Learner — плеєр відеокурсів із Google Drive: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA, що перетворює папку Google Drive у відеокурс із деревом розділів, відновленням позиції перегляду й прогресом, який синхронізується між пристроями без бекенду.

**Architecture:** Статичний React-застосунок без сервера. Відео віддає Service Worker, який проксує `/media/{fileId}` у Drive API, додаючи `Authorization` і прокидаючи `Range`; якщо це не працює (очікувано iOS Safari) — автоматичний відкіт на iframe Drive із ручною відміткою. Прогрес пишеться в IndexedDB і фоном зливається в JSON-файл у `appDataFolder` Drive самого користувача, конфлікти вирішуються per-video last-write-wins.

**Tech Stack:** Vite 5, React 18, TypeScript (strict), Tailwind, React Router 6, Zustand, `idb`, `vite-plugin-pwa` (`injectManifest`), Vitest + Testing Library + MSW + `fake-indexeddb`.

**Спека:** `docs/superpowers/specs/2026-09-20-drive-course-player-design.md`

## Global Constraints

Вимоги цієї секції неявно входять у кожну задачу.

- **Node 20+**, TypeScript у режимі `strict`.
- **Усі** виклики Drive API містять `supportsAllDrives=true` та `includeItemsFromAllDrives=true`. Без цього курси зі Shared Drives і «Shared with me» не читаються.
- Тривалість **усюди в секундах**. `videoMediaMetadata.durationMillis` переводиться в секунди одразу на межі `drive/api`; мілісекунди далі в код не проходять.
- Прогрес ключований **Drive `fileId`**, ніколи шляхом у дереві.
- `COMPLETION_THRESHOLD = 0.9` — поріг автоматичної відмітки «переглянуто».
- Позиція пишеться з тротлінгом **не частіше ніж раз на 5 с**, форсовано на `pause`, `ended`, `pagehide`.
- Синхронізація дебоунситься **10 с** після останньої зміни, форсовано на `pagehide`.
- Записи прогресу **ніколи не видаляються** — навіть коли відео зникло з Drive.
- OAuth scopes: `drive.readonly` + `drive.appdata`. Тип застосунку — **Internal**.
- `VITE_GOOGLE_CLIENT_ID` береться з середовища; у репозиторій не комітиться.

## Відхилення від спеки

**1. Поле `sortKey` з моделі прибрано.** Сканер сортує `children` один раз і зберігає їх уже в правильному порядку, тому `sortKey` був би даними, які ніхто не читає. Порядок елементів у масиві `children` **є** порядком курсу.

**2. Зникле з Drive відео не позначається «недоступним» — воно просто зникає з дерева.** Спека обіцяла позначку на вузлі; щоб її зробити, довелося б тримати вузли-привиди з попереднього сканування й дифити два дерева. Натомість зберігається головне, заради чого та вимога існувала: **запис прогресу не видаляється ніколи**, а якщо користувач відкриє посилання на зниклий урок, `LessonPage` показує «Урок не знайдено — можливо, файл прибрали з Drive». Якщо позначка все-таки знадобиться, це окрема задача, а не частина цієї.

## Структура файлів

```
learner/
├── spike.html                       # Задача 2, одноразова перевірка ризику
├── public/sw-spike.js               # Задача 2
├── src/
│   ├── types.ts                     # TreeNode, Course, ProgressRecord, ProgressMap
│   ├── auth/tokenClient.ts          # GIS token flow, тихе поновлення, трансляція в SW
│   ├── drive/naturalSort.ts         # natural-порівняння назв
│   ├── drive/parseFolderUrl.ts      # URL папки Drive → folderId
│   ├── drive/api.ts                 # Drive REST: listFolder, getFile, appData
│   ├── drive/courseScanner.ts       # рекурсивний обхід → Course
│   ├── progress/aggregate.ts        # чисті функції прогресу
│   ├── storage/mergeProgress.ts     # чиста функція злиття
│   ├── storage/db.ts                # IndexedDB
│   ├── storage/syncEngine.ts        # pull/merge/push + дебаунс
│   ├── store/useStore.ts            # Zustand: courses, progress, дії
│   ├── player/useMediaCapability.ts # proxy чи fallback, із запамʼятовуванням
│   ├── player/VideoPlayer.tsx       # <video>, resume, швидкість, хоткеї
│   ├── player/FallbackPlayer.tsx    # iframe Drive + ручна відмітка
│   ├── ui/ProgressBar.tsx
│   ├── ui/AddCourseDialog.tsx
│   ├── ui/LibraryPage.tsx
│   ├── ui/CoursePage.tsx
│   ├── ui/TreeSection.tsx           # рекурсивний акордеон
│   ├── ui/LessonPage.tsx
│   ├── sw/service-worker.ts         # продакшн медіа-проксі
│   ├── App.tsx, main.tsx, index.css
│   └── test/fixtures/driveCourse.ts # фікстура за структурою реального курсу
└── docs/superpowers/{specs,plans}/
```

Тести лежать поруч із модулем: `src/progress/aggregate.test.ts`.

---

### Task 1: Каркас проєкту, тести, типи

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.env.example`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/types.ts`
- Test: `src/test/smoke.test.tsx`

**Interfaces:**
- Consumes: нічого.
- Produces: типи `TreeNode`, `FolderNode`, `VideoNode`, `Course`, `ProgressRecord`, `ProgressMap`, константа `COMPLETION_THRESHOLD`, функція `emptyProgress()`; робочий `npm test`, `npm run dev`, `npm run build`.

- [ ] **Step 1: Створити проєкт і поставити залежності**

```bash
cd /Users/student/projects/Claude/learner
npm init -y
npm i react react-dom react-router-dom zustand idb
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  'tailwindcss@^3' postcss autoprefixer vitest jsdom @testing-library/react \
  @testing-library/user-event @testing-library/jest-dom msw fake-indexeddb \
  vite-plugin-pwa
npx tailwindcss init -p
```

Tailwind закріплений на 3.x навмисно: у 4.x немає `init -p`, а підключення до PostCSS
інше — план розрахований на 3.x.

`npx tailwindcss init -p` генерує обидва конфіги у форматі CommonJS (`module.exports`),
а `"type": "module"` у `package.json` робить це помилкою. Обидва файли треба перевести
на `export default` — для `tailwind.config.js` вміст наведено нижче, а
`postcss.config.js` має виглядати так:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 2: Налаштувати конфіги**

`package.json` — замінити секцію `scripts`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts` — `allowedHosts: true` потрібен, щоб сторінку можна було відкрити через тунель із телефона (Задача 2):

```ts
// defineConfig саме з 'vitest/config': варіант із 'vite' не знає про ключ `test`,
// а tsconfig перевіряє цей файл, тому `npm run build` падав би на типах.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, allowedHosts: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`tailwind.config.js` — замінити `content`:

```js
export default {
  content: ['./index.html', './spike.html', './src/**/*.{ts,tsx}'],
  // './spike.html' прибирається в Задачі 11 разом із самим файлом спайка.
  theme: { extend: {} },
  plugins: [],
};
```

`.env.example`:

```
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 3: Створити точку входу і setup тестів**

`index.html`:

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Learner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-8 text-lg">Learner</div>;
}
```

`src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Написати падаючий смоук-тест інструментарію**

Задача каркасна: поведінки, яку можна ганяти через TDD, тут ще немає. Тому тест
перевіряє рівно те, що на цьому кроці справді може зламатися, — що працює сам
інструментарій: раннер, jsdom і матчери `jest-dom`. Правильність типів перевіряє
`tsc --noEmit` у Кроці 8, а не рантайм-тест.

`src/test/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('інструментарій', () => {
  it('рендерить застосунок у jsdom і бачить його вміст', () => {
    render(<App />);
    expect(screen.getByText('Learner')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Запустити тест і переконатися, що він падає**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../App"` (файл ще не створено на цьому кроці,
якщо Крок 3 виконувався після Кроку 4; якщо `App.tsx` уже є — тест має пройти одразу,
і це теж валідний результат: інструментарій робочий).

- [ ] **Step 6: Створити типи**

Типів у цій задачі не «досягають» тестом — вони потрібні всім наступним задачам як
спільний словник, і їх правильність перевіряє компілятор.

`src/types.ts`:

```ts
/** Поріг автоматичної відмітки «переглянуто» — 90% тривалості. */
export const COMPLETION_THRESHOLD = 0.9;

export type VideoNode = {
  id: string;
  kind: 'video';
  title: string;
  /** Секунди. null, якщо Drive не віддав тривалість і плеєр її ще не повідомив. */
  durationSec: number | null;
};

export type FolderNode = {
  id: string;
  kind: 'folder';
  title: string;
  /** Уже відсортовані natural sort під час сканування. Порядок масиву = порядок курсу. */
  children: TreeNode[];
};

export type TreeNode = FolderNode | VideoNode;

export type Course = {
  /** Drive folderId кореневої папки курсу. */
  id: string;
  title: string;
  addedAt: number;
  tree: FolderNode;
  lastScannedAt: number;
};

export type ProgressRecord = {
  positionSec: number;
  durationSec: number | null;
  completed: boolean;
  /** epoch ms. Основа для per-video last-write-wins при синхронізації. */
  updatedAt: number;
};

/** Ключ — Drive fileId відео. */
export type ProgressMap = Record<string, ProgressRecord>;

export function emptyProgress(): ProgressMap {
  return {};
}
```

- [ ] **Step 7: Запустити тест і переконатися, що він проходить**

Run: `npm test`
Expected: PASS, 1 тест.

- [ ] **Step 8: Переконатися, що застосунок і типізація живі**

Run: `npm run build`
Expected: збірка без помилок TypeScript.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: каркас проєкту, конфіги, базові типи

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Спайк — чи працює медіа-проксі через Service Worker на iOS

Це головний ризик проєкту, тому перевіряється **другою** задачею, а не останньою. Результат визначає, чи fallback-шлях є аварійним, чи основним UX для частини команди. Код цієї задачі одноразовий і видаляється в Задачі 11.

Токен для спайка беремо з `gcloud` — це прибирає залежність від ще не написаного OAuth.

**Files:**
- Create: `spike.html`, `public/sw-spike.js`
- Create: `docs/superpowers/plans/2026-09-20-spike-result.md`

**Interfaces:**
- Consumes: каркас Vite із Задачі 1.
- Produces: записаний вердикт `proxy працює / не працює` для Chrome-десктоп та iOS Safari; перевірена на практиці форма проксі-обробника, яку Задача 11 переносить у продакшн.

- [ ] **Step 1: Отримати токен Drive через gcloud**

```bash
gcloud auth login --enable-gdrive-access --force
gcloud auth print-access-token
```

Прапорець `--enable-gdrive-access` додає Drive-scope до токена; без нього токен має лише cloud-платформні scopes і Drive відповість `403`. Токен живе близько години — на спайк цього достатньо.

- [ ] **Step 2: Написати Service Worker спайка**

`public/sw-spike.js` — саме `public/`, щоб Vite віддавав файл на корені з правильним scope:

```js
let token = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_TOKEN') token = event.data.token;
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Чіпаємо ТІЛЬКИ свій медіа-маршрут. Решту запитів не торкаємо взагалі.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/media/')) return;
  event.respondWith(proxyMedia(event.request, url.pathname.slice('/media/'.length)));
});

async function proxyMedia(request, fileId) {
  if (!token) return new Response('no token', { status: 401 });

  const headers = new Headers({ Authorization: 'Bearer ' + token });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  const upstream = await fetch(
    'https://www.googleapis.com/drive/v3/files/' + fileId +
      '?alt=media&supportsAllDrives=true',
    { headers },
  );

  // Пробрасуємо лише ті заголовки, що потрібні медіа-елементу.
  const out = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'etag']) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('accept-ranges', 'bytes');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
```

- [ ] **Step 3: Написати сторінку спайка**

`spike.html` у корені проєкту — Vite віддає його як окрему сторінку на `/spike.html`:

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SW media proxy spike</title>
    <style>
      body { font-family: system-ui; padding: 16px; max-width: 720px; }
      input { width: 100%; padding: 8px; margin: 4px 0 12px; }
      video { width: 100%; background: #000; }
      pre { background: #f4f4f5; padding: 8px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Спайк: медіа через Service Worker</h1>
    <label>Access token (gcloud auth print-access-token)</label>
    <input id="token" autocomplete="off" />
    <label>Drive fileId відео</label>
    <input id="fileId" value="10duPIS8qJnVzoWoRXVeG6YNkFr2Gb-fk" />
    <button id="go">Завантажити</button>
    <p id="status">Service Worker: не зареєстровано</p>
    <video id="v" controls playsinline></video>
    <pre id="log"></pre>

    <script type="module">
      const statusEl = document.getElementById('status');
      const logEl = document.getElementById('log');
      const video = document.getElementById('v');
      const log = (m) => { logEl.textContent += m + '\n'; };

      if (!('serviceWorker' in navigator)) {
        statusEl.textContent = 'Service Worker: НЕ ПІДТРИМУЄТЬСЯ — вердикт fallback';
      } else {
        const reg = await navigator.serviceWorker.register('/sw-spike.js');
        await navigator.serviceWorker.ready;
        statusEl.textContent = 'Service Worker: активний (scope ' + reg.scope + ')';
      }

      for (const ev of ['loadedmetadata', 'canplay', 'playing', 'error', 'stalled', 'waiting']) {
        video.addEventListener(ev, () => {
          log(ev + (ev === 'loadedmetadata' ? ' duration=' + video.duration : ''));
        });
      }

      document.getElementById('go').addEventListener('click', async () => {
        logEl.textContent = '';
        const token = document.getElementById('token').value.trim();
        const fileId = document.getElementById('fileId').value.trim();
        navigator.serviceWorker.controller?.postMessage({ type: 'SET_TOKEN', token });
        // Даємо воркеру мить прийняти токен, інакше перший запит піде без нього.
        await new Promise((r) => setTimeout(r, 100));
        video.src = '/media/' + fileId;
        video.load();
      });
    </script>
  </body>
</html>
```

- [ ] **Step 4: Перевірити в Chrome на десктопі**

```bash
npm run dev
```

Відкрити `http://localhost:5173/spike.html`, вставити токен, натиснути «Завантажити».

Expected: у логу зʼявляється `loadedmetadata duration=<число>`, відео грає, перемотка в середину працює і в DevTools → Network видно запити зі статусом `206`.

Якщо `duration` дорівнює `Infinity` або перемотка не працює — це означає, що `content-length`/`content-range` не дійшли; перевірити, що Drive узагалі віддає `206` на запит із `Range`.

- [ ] **Step 5: Перевірити на реальному iPhone**

Vite на LAN віддає `http` — Service Worker у Safari там не зареєструється, бо потрібен secure context. Тому потрібен HTTPS-тунель:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Відкрити видану `https://*.trycloudflare.com/spike.html` у Safari на iPhone, вставити той самий токен.

Expected: один із двох результатів, обидва валідні для проєкту:
- `loadedmetadata` з конкретним `duration` і робочою перемоткою → вердикт **proxy**;
- `error`, вічний `stalled`, або `duration = Infinity` → вердикт **fallback для iOS**.

- [ ] **Step 6: Записати вердикт**

`docs/superpowers/plans/2026-09-20-spike-result.md` — заповнити фактичними наблюденнями:

```markdown
# Результат спайка: медіа-проксі через Service Worker

Дата: 2026-09-__

| Платформа | SW зареєстровано | loadedmetadata | duration | Перемотка | Вердикт |
|---|---|---|---|---|---|
| Chrome desktop | | | | | |
| Safari iOS __ | | | | | |

## Наслідки для реалізації

(Якщо iOS дав fallback: FallbackPlayer — це основний UX для частини команди,
а не аварійний режим. Приділити його вигляду й ручній відмітці стільки ж уваги,
скільки основному плеєру.)

## Сирий лог подій

(вставити вміст <pre> з обох платформ)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "spike: перевірка медіа-проксі через Service Worker на iOS

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Авторизація — Google Cloud і tokenClient

**Files:**
- Create: `src/auth/tokenClient.ts`
- Test: `src/auth/tokenClient.test.ts`
- Modify: `index.html` (додати скрипт GIS)
- Create: `docs/google-cloud-setup.md`

**Interfaces:**
- Consumes: типи з Задачі 1.
- Produces:
  - `createTokenClient(clientId: string): TokenClient`
  - `type TokenClient = { signIn(): Promise<string>; getToken(opts?: { force?: boolean }): Promise<string>; signOut(): void; onChange(cb: (signedIn: boolean) => void): () => void }`
  - `getToken()` повертає дійсний токен, тихо поновлюючи його за потреби; кидає `AuthRequiredError`, якщо потрібна взаємодія користувача.
  - `getToken({ force: true })` обходить кеш. Потрібен для випадку, коли Drive відповів `401` на токен, який за годинником ще свіжий — його відкликали раніше строку.
  - `export class AuthRequiredError extends Error {}`

- [ ] **Step 1: Налаштувати Google Cloud**

Drive API вмикається через CLI:

```bash
gcloud services enable drive.googleapis.com
```

Решта — руками в Console, бо OAuth consent screen і Web client ID `gcloud` не створює. Записати в `docs/google-cloud-setup.md`:

```markdown
# Налаштування Google Cloud

1. `gcloud services enable drive.googleapis.com`
2. Console → APIs & Services → OAuth consent screen:
   - User type: **Internal** (верифікація Google не потрібна)
   - Scopes: `.../auth/drive.readonly`, `.../auth/drive.appdata`
3. Console → Credentials → Create credentials → OAuth client ID:
   - Type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` і продакшн-origin
   - (redirect URI не потрібен: token flow працює без нього)
4. Скопіювати Client ID у `.env.local`: `VITE_GOOGLE_CLIENT_ID=...`

Якщо в домені увімкнено API access controls, адміністратор мусить
позначити застосунок довіреним — це налаштування адмінки, не код.
```

- [ ] **Step 2: Підключити бібліотеку GIS**

У `index.html` перед `</head>`:

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

- [ ] **Step 3: Написати падаючі тести**

`src/auth/tokenClient.test.ts` — GIS підмінюємо фейком, бо тестуємо свою логіку кешу й поновлення, а не бібліотеку Google:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, createTokenClient } from './tokenClient';

type Handler = (resp: { access_token?: string; expires_in?: number; error?: string }) => void;

let callback: Handler;
let requestAccessToken: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
  requestAccessToken = vi.fn();
  (globalThis as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Handler }) => {
          callback = cfg.callback;
          return { requestAccessToken };
        },
      },
    },
  };
});

describe('tokenClient', () => {
  it('signIn повертає токен із відповіді GIS', async () => {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await expect(promise).resolves.toBe('tok-1');
  });

  it('getToken віддає кешований токен без нового запиту до GIS', async () => {
    const client = createTokenClient('cid');
    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;

    requestAccessToken.mockClear();
    await expect(client.getToken()).resolves.toBe('tok-1');
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  it('getToken тихо поновлює токен, що майже прострочений', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    // 59 хвилин пізніше: до закінчення менше запасу в 60 с.
    vi.setSystemTime(new Date('2026-09-20T12:59:30Z'));
    const second = client.getToken();
    callback({ access_token: 'tok-2', expires_in: 3600 });

    await expect(second).resolves.toBe('tok-2');
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('getToken({ force: true }) обходить кеш і бере новий токен', async () => {
    const client = createTokenClient('cid');
    const first = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    const forced = client.getToken({ force: true });
    callback({ access_token: 'tok-2', expires_in: 3600 });

    await expect(forced).resolves.toBe('tok-2');
  });

  it('getToken кидає AuthRequiredError, коли тихе поновлення не вдалося', async () => {
    const client = createTokenClient('cid');
    const promise = client.getToken();
    callback({ error: 'interaction_required' });
    await expect(promise).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('onChange повідомляє про вхід і вихід', async () => {
    const client = createTokenClient('cid');
    const seen: boolean[] = [];
    client.onChange((v) => seen.push(v));

    const promise = client.signIn();
    callback({ access_token: 'tok-1', expires_in: 3600 });
    await promise;
    client.signOut();

    expect(seen).toEqual([true, false]);
  });
});
```

- [ ] **Step 4: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/auth/tokenClient.test.ts`
Expected: FAIL — `Failed to resolve import "./tokenClient"`.

- [ ] **Step 5: Реалізувати tokenClient**

> **Увага: код нижче застаріло.** Він пройшов ревʼю і два фікс-раунди, і реалізація,
> що дійсно працює (`src/auth/tokenClient.ts`, коміт `76dff2a`), свідомо від нього
> відходить за рішенням людини. Три виправлені дефекти цього коду:
>
> 1. Одночасні виклики `getToken()` відкидалися звичайним `Error` замість коалесценції.
>    Це ламало 401-recovery у Задачі 7, де кілька паралельних викликів Drive — норма.
> 2. Провалене поновлення лишало відкликаний токен у кеші «свіжим» за годинником,
>    тож застосунок до години товк мертвим токеном замість екрана входу — пряма
>    суперечність таблиці помилок у спеці.
> 3. `signIn()` приліплювався до вже запущеного тихого поновлення, і при
>    `interaction_required` клік користувача не показував діалог згоди взагалі.
>
> Робоча версія тримає чергу `{ prompt, waiters }` з правилом «апгрейд до consent,
> ніколи назад». Читайте файл, не цей блок.


`src/auth/tokenClient.ts`:

```ts
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

/** Запас перед закінченням токена, щоб не віддати той, що помре в дорозі. */
const EXPIRY_MARGIN_MS = 60_000;

export class AuthRequiredError extends Error {
  constructor(message = 'Потрібен повторний вхід у Google') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

type GisResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type GisClient = { requestAccessToken(opts?: { prompt?: string }): void };

export type TokenClient = {
  signIn(): Promise<string>;
  getToken(opts?: { force?: boolean }): Promise<string>;
  signOut(): void;
  onChange(cb: (signedIn: boolean) => void): () => void;
};

export function createTokenClient(clientId: string): TokenClient {
  let token: string | null = null;
  let expiresAt = 0;
  let pending: { resolve(t: string): void; reject(e: Error): void } | null = null;
  const listeners = new Set<(signedIn: boolean) => void>();

  const gis: GisClient = (
    globalThis as unknown as {
      google: {
        accounts: {
          oauth2: {
            initTokenClient(cfg: {
              client_id: string;
              scope: string;
              callback: (resp: GisResponse) => void;
            }): GisClient;
          };
        };
      };
    }
  ).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPES,
    callback: (resp) => {
      const waiting = pending;
      pending = null;
      if (!resp.access_token) {
        waiting?.reject(new AuthRequiredError(resp.error ?? 'Не вдалося отримати токен'));
        return;
      }
      token = resp.access_token;
      expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
      notify(true);
      waiting?.resolve(token);
    },
  });

  function notify(signedIn: boolean) {
    for (const cb of listeners) cb(signedIn);
  }

  function request(prompt: string): Promise<string> {
    // Один запит за раз: GIS має єдиний колбек, паралельні виклики його переплутають.
    if (pending) return Promise.reject(new Error('Запит токена вже виконується'));
    return new Promise<string>((resolve, reject) => {
      pending = { resolve, reject };
      gis.requestAccessToken({ prompt });
    });
  }

  function isFresh(): boolean {
    return token !== null && Date.now() < expiresAt - EXPIRY_MARGIN_MS;
  }

  return {
    signIn: () => request('consent'),
    getToken: async ({ force = false } = {}) => {
      // force потрібен, коли Drive відповів 401 на токен, що за годинником ще свіжий.
      if (!force && isFresh()) return token!;
      // prompt: '' — тихе поновлення без вікна, якщо сесія Google ще жива.
      return request('');
    },
    signOut: () => {
      token = null;
      expiresAt = 0;
      notify(false);
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
```

- [ ] **Step 6: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/auth/tokenClient.test.ts`
Expected: PASS, 6 тестів.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: OAuth token client і налаштування Google Cloud

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Чисті утиліти — natural sort і розбір URL папки

**Files:**
- Create: `src/drive/naturalSort.ts`, `src/drive/parseFolderUrl.ts`
- Test: `src/drive/naturalSort.test.ts`, `src/drive/parseFolderUrl.test.ts`

**Interfaces:**
- Consumes: нічого.
- Produces:
  - `naturalCompare(a: string, b: string): number` — для `Array.prototype.sort`
  - `parseFolderId(input: string): string | null` — приймає повний URL папки Drive або сам ID

- [ ] **Step 1: Написати падаючі тести**

`src/drive/naturalSort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { naturalCompare } from './naturalSort';

describe('naturalCompare', () => {
  it('ставить 2 перед 10, а не після', () => {
    expect(['10 - Десятий', '2 - Другий'].sort(naturalCompare)).toEqual([
      '2 - Другий',
      '10 - Десятий',
    ]);
  });

  it('вважає 01 і 1 однаковим числом', () => {
    expect(naturalCompare('01 - Вступ', '1 - Вступ')).toBe(0);
  });

  it('сортує реальні назви модулів курсу правильно', () => {
    const input = [
      '03 - Feature Development',
      '01 - Feature Opportunity Validation',
      '04 - Feature Launch & Iteration',
      '02 - Feature Design',
    ];
    expect(input.sort(naturalCompare)).toEqual([
      '01 - Feature Opportunity Validation',
      '02 - Feature Design',
      '03 - Feature Development',
      '04 - Feature Launch & Iteration',
    ]);
  });

  it('не падає на назвах без цифр', () => {
    expect(['Бета', 'Альфа'].sort(naturalCompare)).toEqual(['Альфа', 'Бета']);
  });
});
```

`src/drive/parseFolderUrl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFolderId } from './parseFolderUrl';

const ID = '1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk';

describe('parseFolderId', () => {
  it('дістає ID із посилання на папку', () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
  });

  it('дістає ID із посилання з query-параметрами', () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
  });

  it('дістає ID із посилання формату u/0', () => {
    expect(parseFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
  });

  it('приймає сам ID без URL', () => {
    expect(parseFolderId(ID)).toBe(ID);
  });

  it('обрізає пробіли навколо', () => {
    expect(parseFolderId(`  ${ID}  `)).toBe(ID);
  });

  it('повертає null на посиланні на файл, а не папку', () => {
    expect(parseFolderId('https://drive.google.com/file/d/10duPIS8qJnVzoWoRXVeG6YNkFr2Gb-fk/view'))
      .toBeNull();
  });

  it('повертає null на сміттєвому вводі', () => {
    expect(parseFolderId('не посилання')).toBeNull();
    expect(parseFolderId('')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/drive/naturalSort.test.ts src/drive/parseFolderUrl.test.ts`
Expected: FAIL — обидва імпорти не резолвляться.

- [ ] **Step 3: Реалізувати naturalCompare**

`src/drive/naturalSort.ts`:

```ts
// numeric: true змушує колатор порівнювати послідовності цифр як числа,
// тому «2» стає перед «10», а «01» дорівнює «1».
// sensitivity не задаємо навмисно: 'base' робила б різні назви, що відрізняються
// лише регістром або діакритикою, «рівними», і порядок таких розділів ставав би
// невизначеним. Для «01 = 1» достатньо самого numeric: true.
const collator = new Intl.Collator('uk', { numeric: true });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
```

- [ ] **Step 4: Реалізувати parseFolderId**

`src/drive/parseFolderUrl.ts`:

```ts
/** Drive ID — 20+ символів з обмеженого алфавіту. */
const BARE_ID = /^[A-Za-z0-9_-]{20,}$/;
const FOLDER_URL = /\/folders\/([A-Za-z0-9_-]{20,})/;

/**
 * Приймає посилання на папку Drive у будь-якому зі звичних форматів або сам ID.
 * Повертає null, якщо це не папка — зокрема для посилань на окремий файл.
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = FOLDER_URL.exec(trimmed);
  if (fromUrl) return fromUrl[1] ?? null;

  if (trimmed.includes('/')) return null;
  return BARE_ID.test(trimmed) ? trimmed : null;
}
```

- [ ] **Step 5: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/drive/naturalSort.test.ts src/drive/parseFolderUrl.test.ts`
Expected: PASS, 11 тестів.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: natural sort назв і розбір URL папки Drive

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Агрегація прогресу — найважливіша чиста логіка

Тут живе правило зі спеки, яке легко зламати незаміченим: відео з невідомою тривалістю виключаються **з обох** боків дробу, і лише якщо таких у вузлі всі — вузол падає на підрахунок за кількістю.

**Files:**
- Create: `src/progress/aggregate.ts`
- Test: `src/progress/aggregate.test.ts`

**Interfaces:**
- Consumes: `TreeNode`, `VideoNode`, `Course`, `ProgressMap`, `COMPLETION_THRESHOLD` із `src/types.ts`.
- Produces:
  - `type NodeProgress = { ratio: number; approximate: boolean; videoCount: number; completedCount: number }`
  - `flattenVideos(node: TreeNode): VideoNode[]` — у порядку курсу
  - `effectiveDuration(node: VideoNode, progress: ProgressMap): number | null`
  - `aggregate(node: TreeNode, progress: ProgressMap): NodeProgress`
  - `shouldAutoComplete(positionSec: number, durationSec: number | null): boolean`
  - `findResumeVideoId(course: Course, progress: ProgressMap): string | null`

- [ ] **Step 1: Написати падаючі тести**

`src/progress/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  aggregate,
  effectiveDuration,
  findResumeVideoId,
  flattenVideos,
  shouldAutoComplete,
} from './aggregate';
import type { Course, FolderNode, ProgressMap, ProgressRecord, VideoNode } from '../types';

function video(id: string, durationSec: number | null): VideoNode {
  return { id, kind: 'video', title: id, durationSec };
}

function folder(id: string, children: FolderNode['children']): FolderNode {
  return { id, kind: 'folder', title: id, children };
}

function rec(over: Partial<ProgressRecord> = {}): ProgressRecord {
  return { positionSec: 0, durationSec: null, completed: false, updatedAt: 1, ...over };
}

describe('flattenVideos', () => {
  it('віддає відео в порядку курсу, обходячи дерево в глибину', () => {
    const tree = folder('root', [
      folder('m1', [video('a', 10), video('b', 10)]),
      folder('m2', [folder('s1', [video('c', 10)])]),
    ]);
    expect(flattenVideos(tree).map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('на порожньому дереві віддає порожній масив', () => {
    expect(flattenVideos(folder('root', []))).toEqual([]);
  });
});

describe('effectiveDuration', () => {
  it('бере тривалість із дерева, коли вона там є', () => {
    expect(effectiveDuration(video('a', 120), {})).toBe(120);
  });

  it('падає на тривалість із прогресу, коли в дереві її немає', () => {
    const progress: ProgressMap = { a: rec({ durationSec: 90 }) };
    expect(effectiveDuration(video('a', null), progress)).toBe(90);
  });

  it('віддає null, коли тривалість невідома з обох джерел', () => {
    expect(effectiveDuration(video('a', null), { a: rec() })).toBeNull();
  });
});

describe('aggregate — окреме відео', () => {
  it('без прогресу дає 0', () => {
    expect(aggregate(video('a', 100), {})).toEqual({
      ratio: 0,
      approximate: false,
      videoCount: 1,
      completedCount: 0,
    });
  });

  it('рахує частковий перегляд за часом', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 25 }) };
    expect(aggregate(video('a', 100), progress).ratio).toBeCloseTo(0.25);
  });

  it('позначене переглянутим дає рівно 1, навіть якщо позиція менша', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 10, completed: true }) };
    expect(aggregate(video('a', 100), progress).ratio).toBe(1);
  });

  it('не дає більше 1, якщо позиція перевищила тривалість', () => {
    const progress: ProgressMap = { a: rec({ positionSec: 150 }) };
    expect(aggregate(video('a', 100), progress).ratio).toBe(1);
  });

  it('відео з невідомою тривалістю рахується за фактом завершення й позначається приблизним', () => {
    expect(aggregate(video('a', null), {})).toEqual({
      ratio: 0,
      approximate: true,
      videoCount: 1,
      completedCount: 0,
    });
    const done: ProgressMap = { a: rec({ completed: true }) };
    expect(aggregate(video('a', null), done)).toEqual({
      ratio: 1,
      approximate: true,
      videoCount: 1,
      completedCount: 1,
    });
  });
});

describe('aggregate — папка', () => {
  it('зважує відео за тривалістю, а не за кількістю', () => {
    // 100 с переглянуто повністю + 900 с не почато = 10% курсу, не 50%.
    const tree = folder('root', [video('short', 100), video('long', 900)]);
    const progress: ProgressMap = { short: rec({ completed: true }) };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBeCloseTo(0.1);
    expect(result.approximate).toBe(false);
    expect(result.completedCount).toBe(1);
    expect(result.videoCount).toBe(2);
  });

  it('агрегує через кілька рівнів вкладеності', () => {
    const tree = folder('root', [
      folder('m1', [folder('s1', [video('a', 100)]), video('b', 100)]),
      folder('m2', [video('c', 200)]),
    ]);
    const progress: ProgressMap = { a: rec({ completed: true }), c: rec({ positionSec: 100 }) };
    // (100 + 0 + 100) / 400 = 0.5
    expect(aggregate(tree, progress).ratio).toBeCloseTo(0.5);
  });

  it('виключає відео з невідомою тривалістю з обох боків дробу', () => {
    // Якби переглянуте «unknown» додавалося лише в чисельник, вийшло б понад 100%.
    const tree = folder('root', [video('known', 100), video('unknown', null)]);
    const progress: ProgressMap = {
      known: rec({ completed: true }),
      unknown: rec({ completed: true }),
    };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBe(1);
    expect(result.ratio).toBeLessThanOrEqual(1);
    expect(result.approximate).toBe(false);
    expect(result.completedCount).toBe(2);
  });

  it('падає на підрахунок за кількістю, коли жодне відео не має тривалості', () => {
    const tree = folder('root', [video('a', null), video('b', null), video('c', null)]);
    const progress: ProgressMap = { a: rec({ completed: true }) };
    const result = aggregate(tree, progress);
    expect(result.ratio).toBeCloseTo(1 / 3);
    expect(result.approximate).toBe(true);
  });

  it('порожня папка дає 0 і не вважається приблизною', () => {
    expect(aggregate(folder('root', []), {})).toEqual({
      ratio: 0,
      approximate: false,
      videoCount: 0,
      completedCount: 0,
    });
  });
});

describe('shouldAutoComplete', () => {
  it('спрацьовує на 90% тривалості', () => {
    expect(shouldAutoComplete(90, 100)).toBe(true);
    expect(shouldAutoComplete(89.9, 100)).toBe(false);
  });

  it('не спрацьовує без відомої тривалості', () => {
    expect(shouldAutoComplete(9999, null)).toBe(false);
  });

  it('не спрацьовує при нульовій тривалості', () => {
    expect(shouldAutoComplete(0, 0)).toBe(false);
  });
});

describe('findResumeVideoId', () => {
  const tree = folder('root', [video('a', 100), video('b', 100), video('c', 100)]);
  const course: Course = { id: 'root', title: 'К', addedAt: 0, tree, lastScannedAt: 0 };

  it('на новому курсі віддає перше відео', () => {
    expect(findResumeVideoId(course, {})).toBe('a');
  });

  it('віддає відео з найсвіжішим updatedAt, якщо воно не завершене', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 500, positionSec: 30 }),
    };
    expect(findResumeVideoId(course, progress)).toBe('b');
  });

  it('після завершеного віддає наступне незавершене', () => {
    const progress: ProgressMap = { a: rec({ updatedAt: 500, completed: true }) };
    expect(findResumeVideoId(course, progress)).toBe('b');
  });

  it('пропускає вже завершені при пошуку наступного', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 500, completed: true }),
    };
    expect(findResumeVideoId(course, progress)).toBe('c');
  });

  it('на повністю пройденому курсі віддає останнє переглянуте', () => {
    const progress: ProgressMap = {
      a: rec({ updatedAt: 100, completed: true }),
      b: rec({ updatedAt: 200, completed: true }),
      c: rec({ updatedAt: 300, completed: true }),
    };
    expect(findResumeVideoId(course, progress)).toBe('c');
  });

  it('на курсі без відео віддає null', () => {
    const empty: Course = { ...course, tree: folder('root', []) };
    expect(findResumeVideoId(empty, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/progress/aggregate.test.ts`
Expected: FAIL — `Failed to resolve import "./aggregate"`.

- [ ] **Step 3: Реалізувати aggregate**

`src/progress/aggregate.ts`:

```ts
import { COMPLETION_THRESHOLD } from '../types';
import type { Course, ProgressMap, TreeNode, VideoNode } from '../types';

export type NodeProgress = {
  /** 0..1 */
  ratio: number;
  /**
   * true, коли жодне відео вузла не має відомої тривалості,
   * і відсоток порахований за кількістю переглянутих, а не за часом.
   */
  approximate: boolean;
  videoCount: number;
  completedCount: number;
};

/** Відео в порядку курсу: обхід у глибину, діти вже відсортовані сканером. */
export function flattenVideos(node: TreeNode): VideoNode[] {
  if (node.kind === 'video') return [node];
  return node.children.flatMap(flattenVideos);
}

/**
 * Тривалість із дерева, а якщо Drive її не віддав — та, яку повідомив плеєр.
 * null означає, що вона невідома з обох джерел.
 */
export function effectiveDuration(node: VideoNode, progress: ProgressMap): number | null {
  if (node.durationSec !== null) return node.durationSec;
  return progress[node.id]?.durationSec ?? null;
}

/** Внутрішній акумулятор: час рахується лише по відео з відомою тривалістю. */
type Totals = {
  watchedSec: number;
  knownSec: number;
  videoCount: number;
  completedCount: number;
};

function collect(node: TreeNode, progress: ProgressMap, into: Totals): void {
  if (node.kind === 'folder') {
    for (const child of node.children) collect(child, progress, into);
    return;
  }

  const record = progress[node.id];
  const completed = record?.completed === true;
  into.videoCount += 1;
  if (completed) into.completedCount += 1;

  const duration = effectiveDuration(node, progress);
  // Невідома тривалість — відео не входить у часовий дріб ані чисельником,
  // ані знаменником. Інакше переглянуте відео без тривалості дало б понад 100%.
  if (duration === null || duration <= 0) return;

  into.knownSec += duration;
  into.watchedSec += completed ? duration : Math.min(record?.positionSec ?? 0, duration);
}

export function aggregate(node: TreeNode, progress: ProgressMap): NodeProgress {
  const totals: Totals = { watchedSec: 0, knownSec: 0, videoCount: 0, completedCount: 0 };
  collect(node, progress, totals);

  if (totals.knownSec > 0) {
    return {
      ratio: totals.watchedSec / totals.knownSec,
      approximate: false,
      videoCount: totals.videoCount,
      completedCount: totals.completedCount,
    };
  }

  // Часовий дріб не визначений: або відео немає взагалі, або в жодного немає тривалості.
  return {
    ratio: totals.videoCount > 0 ? totals.completedCount / totals.videoCount : 0,
    approximate: totals.videoCount > 0,
    videoCount: totals.videoCount,
    completedCount: totals.completedCount,
  };
}

/** Автоматична відмітка потребує відомої тривалості — без неї лишається ручна. */
export function shouldAutoComplete(positionSec: number, durationSec: number | null): boolean {
  if (durationSec === null || durationSec <= 0) return false;
  return positionSec >= durationSec * COMPLETION_THRESHOLD;
}

/**
 * «Продовжити з місця зупинки». Окремого поля в моделі немає навмисно:
 * це запис із найбільшим updatedAt, тому вибір синхронізується між пристроями сам.
 * Якщо останнє переглянуте вже завершене — віддаємо наступне незавершене за ним.
 */
export function findResumeVideoId(course: Course, progress: ProgressMap): string | null {
  const videos = flattenVideos(course.tree);
  if (videos.length === 0) return null;

  let lastIndex = -1;
  let lastUpdatedAt = -Infinity;
  videos.forEach((v, index) => {
    const updatedAt = progress[v.id]?.updatedAt;
    if (updatedAt !== undefined && updatedAt > lastUpdatedAt) {
      lastUpdatedAt = updatedAt;
      lastIndex = index;
    }
  });

  if (lastIndex === -1) return videos[0]!.id;

  const last = videos[lastIndex]!;
  if (progress[last.id]?.completed !== true) return last.id;

  for (let i = lastIndex + 1; i < videos.length; i += 1) {
    const candidate = videos[i]!;
    if (progress[candidate.id]?.completed !== true) return candidate.id;
  }
  return last.id;
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/progress/aggregate.test.ts`
Expected: PASS, 24 тести.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: агрегація прогресу за часом із відкотом на підрахунок за кількістю

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Злиття прогресу — per-video last-write-wins

**Files:**
- Create: `src/storage/mergeProgress.ts`
- Test: `src/storage/mergeProgress.test.ts`

**Interfaces:**
- Consumes: `ProgressMap` із `src/types.ts`.
- Produces: `mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap` — чиста функція, не мутує аргументи.

- [ ] **Step 1: Написати падаючі тести**

`src/storage/mergeProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeProgress } from './mergeProgress';
import type { ProgressMap, ProgressRecord } from '../types';

function rec(updatedAt: number, positionSec: number): ProgressRecord {
  return { positionSec, durationSec: 100, completed: false, updatedAt };
}

describe('mergeProgress', () => {
  it('на двох порожніх мапах дає порожню', () => {
    expect(mergeProgress({}, {})).toEqual({});
  });

  it('бере локальний запис, коли він свіжіший', () => {
    const local: ProgressMap = { a: rec(200, 50) };
    const remote: ProgressMap = { a: rec(100, 10) };
    expect(mergeProgress(local, remote).a).toEqual(rec(200, 50));
  });

  it('бере віддалений запис, коли він свіжіший', () => {
    const local: ProgressMap = { a: rec(100, 10) };
    const remote: ProgressMap = { a: rec(300, 80) };
    expect(mergeProgress(local, remote).a).toEqual(rec(300, 80));
  });

  it('при однакових updatedAt лишає локальний — детерміновано', () => {
    const local: ProgressMap = { a: rec(100, 50) };
    const remote: ProgressMap = { a: rec(100, 10) };
    expect(mergeProgress(local, remote).a?.positionSec).toBe(50);
  });

  it('зберігає записи, відсутні з одного боку', () => {
    const local: ProgressMap = { onlyLocal: rec(1, 1) };
    const remote: ProgressMap = { onlyRemote: rec(1, 2) };
    const merged = mergeProgress(local, remote);
    expect(Object.keys(merged).sort()).toEqual(['onlyLocal', 'onlyRemote']);
  });

  it('вирішує конфлікт для кожного відео окремо, а не для мапи цілком', () => {
    // Це головна властивість: телефон випередив по «a», ноутбук — по «b».
    const local: ProgressMap = { a: rec(500, 90), b: rec(100, 5) };
    const remote: ProgressMap = { a: rec(100, 5), b: rec(500, 90) };
    const merged = mergeProgress(local, remote);
    expect(merged.a?.positionSec).toBe(90);
    expect(merged.b?.positionSec).toBe(90);
  });

  it('не мутує вхідні мапи', () => {
    const local: ProgressMap = { a: rec(100, 10) };
    const remote: ProgressMap = { b: rec(100, 20) };
    mergeProgress(local, remote);
    expect(Object.keys(local)).toEqual(['a']);
    expect(Object.keys(remote)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/storage/mergeProgress.test.ts`
Expected: FAIL — `Failed to resolve import "./mergeProgress"`.

- [ ] **Step 3: Реалізувати mergeProgress**

`src/storage/mergeProgress.ts`:

```ts
import type { ProgressMap } from '../types';

/**
 * Зливає локальний і віддалений прогрес per-video last-write-wins за updatedAt.
 * Конфлікт вирішується на рівні окремого відео, а не файлу цілком — тому перегляд
 * на телефоні й на ноутбуці в один день не затирає один одного.
 * При однакових updatedAt перемагає локальний: користувачеві передбачуваніше
 * бачити те, що він щойно робив на цьому пристрої.
 */
export function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...remote };
  for (const [fileId, record] of Object.entries(local)) {
    const existing = merged[fileId];
    if (!existing || record.updatedAt >= existing.updatedAt) {
      merged[fileId] = record;
    }
  }
  return merged;
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/storage/mergeProgress.test.ts`
Expected: PASS, 7 тестів.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: злиття прогресу per-video last-write-wins

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Drive API — обгортка з Shared Drives, backoff і appDataFolder

Тривалість переводиться в секунди **тут, на межі**: далі в код мілісекунди не проходять.

**Files:**
- Create: `src/drive/api.ts`
- Test: `src/drive/api.test.ts`
- Create: `src/test/msw.ts`

**Interfaces:**
- Consumes: нічого з попередніх задач.
- Produces:
  - `type DriveFile = { id: string; name: string; mimeType: string; trashed: boolean; durationSec: number | null }`
  - `type AppDataPayload = { content: unknown; modifiedTime: string }`
  - `type DriveApi = { listFolder(folderId: string): Promise<DriveFile[]>; getFile(fileId: string): Promise<DriveFile>; statAppData(name: string): Promise<{ id: string; modifiedTime: string } | null>; readAppData(name: string): Promise<AppDataPayload | null>; writeAppData(name: string, content: unknown): Promise<{ modifiedTime: string }> }`
  - `statAppData` існує окремо від `readAppData`, щоб синхронізатор міг дізнатися `modifiedTime` **не завантажуючи** вміст.
  - `class DriveError extends Error { readonly status: number }`
  - `createDriveApi(getToken: (opts?: { force?: boolean }) => Promise<string>, options?: { sleep?: (ms: number) => Promise<void>; maxRetries?: number }): DriveApi`
  - На `401` робиться **одна** спроба з `getToken({ force: true })` — як вимагає таблиця помилок у спеці.

- [ ] **Step 1: Написати падаючі тести**

`src/test/msw.ts`:

```ts
import { setupServer } from 'msw/node';

export const server = setupServer();
```

`src/drive/api.test.ts`:

```ts
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DriveError, createDriveApi } from './api';
import { server } from '../test/msw';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// sleep без реального очікування, щоб тести на backoff були швидкі
const api = () => createDriveApi(async () => 'tok', { sleep: async () => {} });

describe('listFolder', () => {
  it('передає supportsAllDrives та includeItemsFromAllDrives', async () => {
    let seen: URL | undefined;
    server.use(
      http.get(FILES, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ files: [] });
      }),
    );

    await api().listFolder('folder-1');

    expect(seen?.searchParams.get('supportsAllDrives')).toBe('true');
    expect(seen?.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(seen?.searchParams.get('q')).toBe("'folder-1' in parents and trashed = false");
  });

  it('додає заголовок Authorization', async () => {
    let auth: string | null = null;
    server.use(
      http.get(FILES, ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ files: [] });
      }),
    );

    await api().listFolder('folder-1');
    expect(auth).toBe('Bearer tok');
  });

  it('переводить durationMillis у секунди', async () => {
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({
          files: [
            {
              id: 'v1',
              name: 'Урок.mp4',
              mimeType: 'video/mp4',
              videoMediaMetadata: { durationMillis: '754000' },
            },
          ],
        }),
      ),
    );

    const [file] = await api().listFolder('folder-1');
    expect(file?.durationSec).toBe(754);
  });

  it('віддає durationSec = null, коли Drive не дав метаданих', async () => {
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'v1', name: 'a.mp4', mimeType: 'video/mp4' }] }),
      ),
    );

    const [file] = await api().listFolder('folder-1');
    expect(file?.durationSec).toBeNull();
  });

  it('склеює всі сторінки пагінації', async () => {
    let call = 0;
    server.use(
      http.get(FILES, () => {
        call += 1;
        return call === 1
          ? HttpResponse.json({
              files: [{ id: 'a', name: 'a', mimeType: 'video/mp4' }],
              nextPageToken: 'p2',
            })
          : HttpResponse.json({ files: [{ id: 'b', name: 'b', mimeType: 'video/mp4' }] });
      }),
    );

    const files = await api().listFolder('folder-1');
    expect(files.map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('обробка помилок', () => {
  it('на 401 робить одну спробу з примусовим поновленням токена', async () => {
    const tokens: string[] = [];
    let calls = 0;
    server.use(
      http.get(FILES, ({ request }) => {
        calls += 1;
        tokens.push(request.headers.get('Authorization') ?? '');
        if (calls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ files: [] });
      }),
    );

    const forced: boolean[] = [];
    const client = createDriveApi(
      async (opts) => {
        forced.push(opts?.force === true);
        return opts?.force ? 'tok-new' : 'tok-old';
      },
      { sleep: async () => {} },
    );

    await expect(client.listFolder('f')).resolves.toEqual([]);
    expect(forced).toEqual([false, true]);
    expect(tokens[1]).toBe('Bearer tok-new');
  });

  it('здається після другого 401 — повторний вхід уже не автоматичний', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(calls).toBe(2);
  });

  it('повторює 429 з backoff і врешті успішний', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({ files: [] });
      }),
    );

    await expect(api().listFolder('f')).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it('повторює 403 rateLimitExceeded, але не 403 за правами доступу', async () => {
    let rateCalls = 0;
    server.use(
      http.get(FILES, () => {
        rateCalls += 1;
        return HttpResponse.json(
          { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
          { status: 403 },
        );
      }),
    );
    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(rateCalls).toBeGreaterThan(1);

    server.resetHandlers();
    let permCalls = 0;
    server.use(
      http.get(FILES, () => {
        permCalls += 1;
        return HttpResponse.json(
          { error: { errors: [{ reason: 'insufficientFilePermissions' }] } },
          { status: 403 },
        );
      }),
    );
    await expect(api().listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(permCalls).toBe(1);
  });

  it('здається після maxRetries', async () => {
    let calls = 0;
    server.use(
      http.get(FILES, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const limited = createDriveApi(async () => 'tok', { sleep: async () => {}, maxRetries: 2 });
    await expect(limited.listFolder('f')).rejects.toBeInstanceOf(DriveError);
    expect(calls).toBe(3); // перша спроба + 2 повтори
  });
});

describe('appDataFolder', () => {
  it('readAppData віддає null, коли файлу ще немає', async () => {
    server.use(http.get(FILES, () => HttpResponse.json({ files: [] })));
    await expect(api().readAppData('p.json')).resolves.toBeNull();
  });

  it('readAppData шукає у просторі appDataFolder і віддає вміст із modifiedTime', async () => {
    let seen: URL | undefined;
    server.use(
      http.get(FILES, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({
          files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }],
        });
      }),
      http.get(`${FILES}/f1`, () => HttpResponse.json({ hello: 'world' })),
    );

    const result = await api().readAppData('p.json');
    expect(seen?.searchParams.get('spaces')).toBe('appDataFolder');
    expect(result).toEqual({
      content: { hello: 'world' },
      modifiedTime: '2026-09-20T10:00:00.000Z',
    });
  });

  it('statAppData віддає modifiedTime, не завантажуючи вміст', async () => {
    let mediaCalls = 0;
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }] }),
      ),
      http.get(`${FILES}/f1`, () => {
        mediaCalls += 1;
        return HttpResponse.json({});
      }),
    );

    await expect(api().statAppData('p.json')).resolves.toEqual({
      id: 'f1',
      modifiedTime: '2026-09-20T10:00:00.000Z',
    });
    expect(mediaCalls).toBe(0);
  });

  it('writeAppData створює файл через POST, коли його ще немає', async () => {
    let method: string | undefined;
    server.use(
      http.get(FILES, () => HttpResponse.json({ files: [] })),
      http.post(UPLOAD, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ id: 'new', modifiedTime: '2026-09-20T11:00:00.000Z' });
      }),
    );

    const result = await api().writeAppData('p.json', { a: 1 });
    expect(method).toBe('POST');
    expect(result.modifiedTime).toBe('2026-09-20T11:00:00.000Z');
  });

  it('writeAppData оновлює наявний файл через PATCH', async () => {
    let patched = false;
    server.use(
      http.get(FILES, () =>
        HttpResponse.json({ files: [{ id: 'f1', modifiedTime: '2026-09-20T10:00:00.000Z' }] }),
      ),
      http.patch(`${UPLOAD}/f1`, async ({ request }) => {
        patched = true;
        await expect(request.text()).resolves.toBe('{"a":2}');
        return HttpResponse.json({ id: 'f1', modifiedTime: '2026-09-20T12:00:00.000Z' });
      }),
    );

    const result = await api().writeAppData('p.json', { a: 2 });
    expect(patched).toBe(true);
    expect(result.modifiedTime).toBe('2026-09-20T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/drive/api.test.ts`
Expected: FAIL — `Failed to resolve import "./api"`.

- [ ] **Step 3: Реалізувати Drive API**

`src/drive/api.ts`:

```ts
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const FILE_FIELDS = 'id,name,mimeType,trashed,videoMediaMetadata(durationMillis)';

/** Без цих двох параметрів Drive не повертає елементи зі Shared Drives і «Shared with me». */
const SHARED_DRIVES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };

/** 403-причини, які означають «спробуй пізніше», а не «тобі не можна». */
const RETRIABLE_403 = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
]);

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  trashed: boolean;
  /** Секунди. Переведено тут, на межі: мілісекунди далі в код не проходять. */
  durationSec: number | null;
};

export type AppDataPayload = { content: unknown; modifiedTime: string };

export type DriveApi = {
  listFolder(folderId: string): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFile>;
  /** Метадані без завантаження вмісту — щоб не тягнути файл, який не змінився. */
  statAppData(name: string): Promise<{ id: string; modifiedTime: string } | null>;
  readAppData(name: string): Promise<AppDataPayload | null>;
  writeAppData(name: string, content: unknown): Promise<{ modifiedTime: string }>;
};

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

type RawFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
  videoMediaMetadata?: { durationMillis?: string };
};

function toDriveFile(raw: RawFile): DriveFile {
  const millis = raw.videoMediaMetadata?.durationMillis;
  const parsed = millis === undefined ? NaN : Number(millis);
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    mimeType: raw.mimeType ?? '',
    trashed: raw.trashed ?? false,
    durationSec: Number.isFinite(parsed) ? parsed / 1000 : null,
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createDriveApi(
  getToken: (opts?: { force?: boolean }) => Promise<string>,
  options: { sleep?: (ms: number) => Promise<void>; maxRetries?: number } = {},
): DriveApi {
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 4;

  async function shouldRetry(response: Response): Promise<boolean> {
    if (response.status === 429 || response.status >= 500) return true;
    if (response.status !== 403) return false;
    // 403 буває і «ліміт», і «немає прав» — повторювати можна лише перше.
    try {
      const body = (await response.clone().json()) as {
        error?: { errors?: Array<{ reason?: string }> };
      };
      const reason = body.error?.errors?.[0]?.reason;
      return reason !== undefined && RETRIABLE_403.has(reason);
    } catch {
      return false;
    }
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let lastStatus = 0;
    let lastText = '';
    let force = false;
    let refreshedOnce = false;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const token = await getToken(force ? { force: true } : undefined);
      force = false;

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(url, { ...init, headers });
      if (response.ok) return response;

      lastStatus = response.status;
      lastText = response.statusText;

      // Токен могли відкликати раніше строку: одна спроба тихого поновлення,
      // далі вирішує застосунок — показати екран входу.
      if (response.status === 401 && !refreshedOnce) {
        refreshedOnce = true;
        force = true;
        continue;
      }

      if (!(await shouldRetry(response))) break;
      if (attempt === maxRetries) break;

      // Експоненційний backoff із jitter, щоб кілька вкладок не били в такт.
      await sleep(2 ** attempt * 500 + Math.random() * 250);
    }

    throw new DriveError(lastStatus, `Drive API ${lastStatus} ${lastText}`.trim());
  }

  function query(params: Record<string, string>): string {
    return new URLSearchParams(params).toString();
  }

  return {
    async listFolder(folderId) {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const url = `${API}?${query({
          ...SHARED_DRIVES,
          q: `'${folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: '1000',
          ...(pageToken ? { pageToken } : {}),
        })}`;

        const body = (await (await request(url)).json()) as {
          files?: RawFile[];
          nextPageToken?: string;
        };
        for (const raw of body.files ?? []) files.push(toDriveFile(raw));
        pageToken = body.nextPageToken;
      } while (pageToken);

      return files;
    },

    async getFile(fileId) {
      const url = `${API}/${fileId}?${query({ ...SHARED_DRIVES, fields: FILE_FIELDS })}`;
      return toDriveFile((await (await request(url)).json()) as RawFile);
    },

    statAppData(name) {
      return findAppDataFile(name);
    },

    async readAppData(name) {
      const found = await findAppDataFile(name);
      if (!found) return null;

      const url = `${API}/${found.id}?${query({ alt: 'media' })}`;
      const content = (await (await request(url)).json()) as unknown;
      return { content, modifiedTime: found.modifiedTime };
    },

    async writeAppData(name, content) {
      const found = await findAppDataFile(name);
      const body = JSON.stringify(content);

      if (found) {
        const url = `${UPLOAD}/${found.id}?${query({ uploadType: 'media', fields: 'modifiedTime' })}`;
        const updated = (await (
          await request(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        ).json()) as { modifiedTime?: string };
        return { modifiedTime: updated.modifiedTime ?? new Date().toISOString() };
      }

      // Multipart: перша частина — метадані з батьківською appDataFolder, друга — вміст.
      const boundary = 'learner-boundary';
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${body}\r\n--${boundary}--`;

      const url = `${UPLOAD}?${query({ uploadType: 'multipart', fields: 'modifiedTime' })}`;
      const created = (await (
        await request(url, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipart,
        })
      ).json()) as { modifiedTime?: string };
      return { modifiedTime: created.modifiedTime ?? new Date().toISOString() };
    },
  };

  async function findAppDataFile(
    name: string,
  ): Promise<{ id: string; modifiedTime: string } | null> {
    const url = `${API}?${query({
      spaces: 'appDataFolder',
      q: `name = '${name}' and trashed = false`,
      fields: 'files(id,modifiedTime)',
      pageSize: '1',
    })}`;
    const body = (await (await request(url)).json()) as {
      files?: Array<{ id?: string; modifiedTime?: string }>;
    };
    const file = body.files?.[0];
    if (!file?.id) return null;
    return { id: file.id, modifiedTime: file.modifiedTime ?? new Date().toISOString() };
  }
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/drive/api.test.ts`
Expected: PASS, 15 тестів.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: обгортка Drive API з Shared Drives, backoff і appDataFolder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Сканер курсу

**Files:**
- Create: `src/drive/courseScanner.ts`
- Create: `src/test/fixtures/driveCourse.ts`
- Test: `src/drive/courseScanner.test.ts`

**Interfaces:**
- Consumes: `DriveApi`, `DriveFile` із `src/drive/api.ts`; `naturalCompare` із `src/drive/naturalSort.ts`; `Course`, `FolderNode`, `TreeNode` із `src/types.ts`.
- Produces: `scanCourse(api: DriveApi, folderId: string, now?: number): Promise<Course>`

- [ ] **Step 1: Створити фікстуру за структурою реального курсу**

`src/test/fixtures/driveCourse.ts`:

```ts
import type { DriveFile } from '../../drive/api';

const FOLDER = 'application/vnd.google-apps.folder';

function folder(id: string, name: string): DriveFile {
  return { id, name, mimeType: FOLDER, trashed: false, durationSec: null };
}

function video(id: string, name: string, durationSec: number | null): DriveFile {
  return { id, name, mimeType: 'video/mp4', trashed: false, durationSec };
}

function junk(id: string, name: string): DriveFile {
  return { id, name, mimeType: 'application/octet-stream', trashed: false, durationSec: null };
}

export const ROOT_ID = 'root-course';

/**
 * Зліплено зі структури реального курсу: модулі з номерами, вкладені підрозділи,
 * mp4 у листках і .DS_Store у чотирьох папках.
 *
 * `m03` існує спеціально для тесту обрізання: він порожній на два рівні вглиб,
 * тому мусить зникнути цілком. `m02` навмисно НЕ порожній — інакше тест на
 * сортування модулів лишився б з одноелементним масивом і перестав би
 * перевіряти сортування взагалі.
 */
export const COURSE_LISTING: Record<string, DriveFile[]> = {
  [ROOT_ID]: [
    folder('m02', '02 - Feature Design'),
    folder('m01', '01 - Feature Opportunity Validation'),
    folder('m03', '03 - Порожній модуль'),
    junk('junk-root', '.DS_Store'),
  ],
  m01: [
    folder('m01s02', '2 - Validate & Communicate Opportunity'),
    folder('m01s01', '1 - Refine Business Value'),
    folder('m01s10', '10 - Пізній розділ'),
  ],
  m01s01: [
    video('v-funnel', 'Funnel Analysis.mp4', 600),
    video('v-value', 'Estimating Business Value.mp4', 900),
  ],
  m01s02: [video('v-comm', 'Communicating Opportunities.mp4', 300), junk('junk-s02', '.DS_Store')],
  m01s10: [video('v-late', 'Пізнє відео.mp4', null)],
  m02: [folder('m02s01', '1 - Constrained Divergence')],
  m02s01: [video('v-diverge', 'Constrained Divergence.mp4', 480), junk('junk-m02s01', '.DS_Store')],
  m03: [folder('m03s01', '1 - Тільки смітник')],
  // Порожня після фільтрації на два рівні вглиб: модуль має зникнути цілком.
  m03s01: [junk('junk-m03s01', '.DS_Store')],
};

export const ROOT_FILE: DriveFile = folder(ROOT_ID, 'Product Management Course');
```

- [ ] **Step 2: Написати падаючі тести**

`src/drive/courseScanner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { scanCourse } from './courseScanner';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { DriveApi, DriveFile } from './api';
import type { FolderNode, TreeNode } from '../types';

function fakeApi(listing: Record<string, DriveFile[]> = COURSE_LISTING): DriveApi {
  return {
    listFolder: vi.fn(async (id: string) => listing[id] ?? []),
    getFile: vi.fn(async () => ROOT_FILE),
    statAppData: vi.fn(async () => null),
    readAppData: vi.fn(async () => null),
    writeAppData: vi.fn(async () => ({ modifiedTime: '' })),
  };
}

const titles = (node: FolderNode): string[] => node.children.map((c) => c.title);
const child = (node: FolderNode, index: number): TreeNode => node.children[index]!;
const asFolder = (node: TreeNode): FolderNode => {
  if (node.kind !== 'folder') throw new Error(`очікувалася папка, отримано ${node.kind}`);
  return node;
};

describe('scanCourse', () => {
  it('бере назву курсу з назви кореневої папки', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    expect(course.title).toBe('Product Management Course');
    expect(course.id).toBe(ROOT_ID);
  });

  it('сортує модулі natural sort', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    expect(titles(course.tree)).toEqual([
      '01 - Feature Opportunity Validation',
      '02 - Feature Design',
    ]);
  });

  it('ставить розділ 10 після розділу 2, а не між 1 і 2', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const module1 = asFolder(child(course.tree, 0));
    expect(titles(module1)).toEqual([
      '1 - Refine Business Value',
      '2 - Validate & Communicate Opportunity',
      '10 - Пізній розділ',
    ]);
  });

  it('відкидає .DS_Store та інші не-відео файли', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const all: string[] = [];
    const walk = (n: TreeNode) => {
      all.push(n.title);
      if (n.kind === 'folder') n.children.forEach(walk);
    };
    walk(course.tree);
    expect(all).not.toContain('.DS_Store');
  });

  it('прибирає папки, що стали порожніми після фільтрації', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    // 03 містить лише підпапку з одним .DS_Store, тому зникає цілком —
    // разом із підпапкою, а не лишається порожнім розділом.
    expect(titles(course.tree)).not.toContain('03 - Порожній модуль');
  });

  it('переносить тривалість відео у дерево', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const section = asFolder(child(asFolder(child(course.tree, 0)), 0));
    const video = child(section, 0);
    expect(video).toMatchObject({ kind: 'video', title: 'Estimating Business Value.mp4' });
    expect(video.kind === 'video' && video.durationSec).toBe(900);
  });

  it('зберігає null для відео без тривалості', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID);
    const late = asFolder(child(asFolder(child(course.tree, 0)), 2));
    const video = child(late, 0);
    expect(video.kind === 'video' && video.durationSec).toBeNull();
  });

  it('пише lastScannedAt із переданого часу', async () => {
    const course = await scanCourse(fakeApi(), ROOT_ID, 1_700_000_000_000);
    expect(course.lastScannedAt).toBe(1_700_000_000_000);
    expect(course.addedAt).toBe(1_700_000_000_000);
  });

  it('на курсі без жодного відео віддає порожнє дерево, а не падає', async () => {
    const api = fakeApi({ [ROOT_ID]: [] });
    const course = await scanCourse(api, ROOT_ID);
    expect(course.tree.children).toEqual([]);
  });

  it('не зациклюється на папці, що містить себе', async () => {
    // Ярлики Drive теоретично дозволяють цикл; сканер має впертися в межу глибини.
    const api = fakeApi({
      [ROOT_ID]: [
        { id: 'loop', name: 'Петля', mimeType: 'application/vnd.google-apps.folder', trashed: false, durationSec: null },
      ],
      loop: [
        { id: 'loop', name: 'Петля', mimeType: 'application/vnd.google-apps.folder', trashed: false, durationSec: null },
      ],
    });
    await expect(scanCourse(api, ROOT_ID)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/drive/courseScanner.test.ts`
Expected: FAIL — `Failed to resolve import "./courseScanner"`.

- [ ] **Step 4: Реалізувати сканер**

`src/drive/courseScanner.ts`:

```ts
import { naturalCompare } from './naturalSort';
import type { DriveApi, DriveFile } from './api';
import type { Course, FolderNode, TreeNode } from '../types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Захист від циклів через ярлики Drive: реальні курси значно дрібніші. */
const MAX_DEPTH = 12;

function isVisible(file: DriveFile): boolean {
  return !file.trashed && !file.name.startsWith('.');
}

async function scanFolder(
  api: DriveApi,
  folderId: string,
  title: string,
  depth: number,
): Promise<FolderNode> {
  if (depth >= MAX_DEPTH) {
    return { id: folderId, kind: 'folder', title, children: [] };
  }

  const entries = (await api.listFolder(folderId)).filter(isVisible);
  const children: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.mimeType === FOLDER_MIME) {
      const sub = await scanFolder(api, entry.id, entry.name, depth + 1);
      // Папка без жодного відео в піддереві курсу не показує — лишився б порожній розділ.
      if (sub.children.length > 0) children.push(sub);
    } else if (entry.mimeType.startsWith('video/')) {
      children.push({
        id: entry.id,
        kind: 'video',
        title: entry.name,
        durationSec: entry.durationSec,
      });
    }
  }

  children.sort((a, b) => naturalCompare(a.title, b.title));
  return { id: folderId, kind: 'folder', title, children };
}

/**
 * Рекурсивно обходить папку Drive і будує дерево курсу.
 * Діти кожного вузла зберігаються вже відсортованими — порядок масиву є порядком курсу.
 */
export async function scanCourse(
  api: DriveApi,
  folderId: string,
  now: number = Date.now(),
): Promise<Course> {
  const root = await api.getFile(folderId);
  const tree = await scanFolder(api, folderId, root.name, 0);
  return { id: folderId, title: root.name, addedAt: now, tree, lastScannedAt: now };
}
```

- [ ] **Step 5: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/drive/courseScanner.test.ts`
Expected: PASS, 10 тестів.

- [ ] **Step 6: Прогнати весь набір тестів**

Run: `npm test`
Expected: PASS, усі тести задач 1–8.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: рекурсивний сканер курсу з фільтрацією смітника

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: IndexedDB

**Files:**
- Create: `src/storage/db.ts`
- Test: `src/storage/db.test.ts`

**Interfaces:**
- Consumes: `Course`, `ProgressMap`, `ProgressRecord` із `src/types.ts`.
- Produces:
  - `type LearnerDb = { getCourses(): Promise<Course[]>; getCourse(id: string): Promise<Course | undefined>; putCourse(course: Course): Promise<void>; deleteCourse(id: string): Promise<void>; getProgress(): Promise<ProgressMap>; putProgressRecord(fileId: string, record: ProgressRecord): Promise<void>; replaceProgress(map: ProgressMap): Promise<void>; getMeta<T>(key: string): Promise<T | undefined>; setMeta(key: string, value: unknown): Promise<void> }`
  - `openLearnerDb(name?: string): Promise<LearnerDb>`

- [ ] **Step 1: Написати падаючі тести**

`src/storage/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openLearnerDb } from './db';
import type { Course, LearnerDb, ProgressRecord } from './db';

function course(id: string, title: string): Course {
  return {
    id,
    title,
    addedAt: 1,
    tree: { id, kind: 'folder', title, children: [] },
    lastScannedAt: 1,
  };
}

function rec(over: Partial<ProgressRecord> = {}): ProgressRecord {
  return { positionSec: 10, durationSec: 100, completed: false, updatedAt: 5, ...over };
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`learner-test-${counter}`);
});

describe('курси', () => {
  it('на новій базі список курсів порожній', async () => {
    await expect(db.getCourses()).resolves.toEqual([]);
  });

  it('зберігає й читає курс', async () => {
    await db.putCourse(course('c1', 'Курс 1'));
    await expect(db.getCourse('c1')).resolves.toMatchObject({ title: 'Курс 1' });
  });

  it('перезапис курсу з тим самим id не створює дубль', async () => {
    await db.putCourse(course('c1', 'Старий'));
    await db.putCourse(course('c1', 'Новий'));
    const all = await db.getCourses();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe('Новий');
  });

  it('видаляє курс', async () => {
    await db.putCourse(course('c1', 'Курс'));
    await db.deleteCourse('c1');
    await expect(db.getCourses()).resolves.toEqual([]);
  });
});

describe('прогрес', () => {
  it('на новій базі прогрес порожній', async () => {
    await expect(db.getProgress()).resolves.toEqual({});
  });

  it('пише й читає окремий запис за fileId', async () => {
    await db.putProgressRecord('v1', rec({ positionSec: 42 }));
    const progress = await db.getProgress();
    expect(progress.v1?.positionSec).toBe(42);
  });

  it('replaceProgress повністю замінює вміст', async () => {
    await db.putProgressRecord('old', rec());
    await db.replaceProgress({ fresh: rec({ positionSec: 7 }) });
    const progress = await db.getProgress();
    expect(Object.keys(progress)).toEqual(['fresh']);
  });

  it('видалення курсу не чіпає прогрес — записи не втрачаються', async () => {
    await db.putCourse(course('c1', 'Курс'));
    await db.putProgressRecord('v1', rec());
    await db.deleteCourse('c1');
    await expect(db.getProgress()).resolves.toHaveProperty('v1');
  });
});

describe('meta', () => {
  it('невідомий ключ дає undefined', async () => {
    await expect(db.getMeta('nope')).resolves.toBeUndefined();
  });

  it('зберігає й читає значення', async () => {
    await db.setMeta('remoteModifiedTime', '2026-09-20T10:00:00.000Z');
    await expect(db.getMeta<string>('remoteModifiedTime')).resolves.toBe(
      '2026-09-20T10:00:00.000Z',
    );
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/storage/db.test.ts`
Expected: FAIL — `Failed to resolve import "./db"`.

- [ ] **Step 3: Реалізувати сховище**

`src/storage/db.ts`:

```ts
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Course, ProgressMap, ProgressRecord } from '../types';

export type { Course, ProgressMap, ProgressRecord } from '../types';

const DB_VERSION = 1;

/** У IndexedDB запис прогресу лежить разом із ключем, бо store має keyPath. */
type StoredProgress = ProgressRecord & { fileId: string };

interface LearnerSchema extends DBSchema {
  courses: { key: string; value: Course };
  progress: { key: string; value: StoredProgress };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type LearnerDb = {
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  putCourse(course: Course): Promise<void>;
  deleteCourse(id: string): Promise<void>;
  getProgress(): Promise<ProgressMap>;
  putProgressRecord(fileId: string, record: ProgressRecord): Promise<void>;
  replaceProgress(map: ProgressMap): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
};

export async function openLearnerDb(name = 'learner'): Promise<LearnerDb> {
  const db: IDBPDatabase<LearnerSchema> = await openDB<LearnerSchema>(name, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('courses', { keyPath: 'id' });
      database.createObjectStore('progress', { keyPath: 'fileId' });
      database.createObjectStore('meta', { keyPath: 'key' });
    },
  });

  return {
    getCourses: () => db.getAll('courses'),
    getCourse: (id) => db.get('courses', id),
    putCourse: async (course) => {
      await db.put('courses', course);
    },
    // Видалення курсу свідомо не торкається прогресу: це єдині невідтворювані дані.
    deleteCourse: async (id) => {
      await db.delete('courses', id);
    },

    getProgress: async () => {
      const rows = await db.getAll('progress');
      const map: ProgressMap = {};
      for (const { fileId, ...record } of rows) map[fileId] = record;
      return map;
    },

    putProgressRecord: async (fileId, record) => {
      await db.put('progress', { fileId, ...record });
    },

    replaceProgress: async (map) => {
      const tx = db.transaction('progress', 'readwrite');
      await tx.store.clear();
      for (const [fileId, record] of Object.entries(map)) {
        await tx.store.put({ fileId, ...record });
      }
      await tx.done;
    },

    getMeta: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    setMeta: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/storage/db.test.ts`
Expected: PASS, 10 тестів.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: сховище IndexedDB для курсів, прогресу й метаданих

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Синхронізація з appDataFolder

**Files:**
- Create: `src/storage/syncEngine.ts`
- Test: `src/storage/syncEngine.test.ts`

**Interfaces:**
- Consumes: `LearnerDb` із `src/storage/db.ts`, `DriveApi` із `src/drive/api.ts`, `mergeProgress` із `src/storage/mergeProgress.ts`.
- Produces:
  - `const PROGRESS_FILE = 'learner-progress.json'`
  - `const SYNC_DEBOUNCE_MS = 10_000`
  - `type SyncEngine = { syncNow(): Promise<ProgressMap>; scheduleSync(): void; flush(): Promise<void> }`
  - `createSyncEngine(db: LearnerDb, api: DriveApi, options?: { debounceMs?: number }): SyncEngine`

- [ ] **Step 1: Написати падаючі тести**

`src/storage/syncEngine.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_FILE, createSyncEngine } from './syncEngine';
import { openLearnerDb } from './db';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

function rec(updatedAt: number, positionSec: number): ProgressRecord {
  return { positionSec, durationSec: 100, completed: false, updatedAt };
}

type FakeDrive = DriveApi & {
  remote: ProgressMap | null;
  modifiedTime: string;
  writes: number;
  downloads: number;
};

function fakeDrive(remote: ProgressMap | null = null): FakeDrive {
  const drive: FakeDrive = {
    remote,
    modifiedTime: '2026-09-20T10:00:00.000Z',
    writes: 0,
    downloads: 0,
    listFolder: vi.fn(async () => []),
    getFile: vi.fn(async () => ({
      id: 'x',
      name: 'x',
      mimeType: 'application/vnd.google-apps.folder',
      trashed: false,
      durationSec: null,
    })),
    statAppData: vi.fn(async () =>
      drive.remote === null ? null : { id: 'f1', modifiedTime: drive.modifiedTime },
    ),
    readAppData: vi.fn(async () => {
      if (drive.remote === null) return null;
      drive.downloads += 1;
      return { content: drive.remote, modifiedTime: drive.modifiedTime };
    }),
    writeAppData: vi.fn(async (_name: string, content: unknown) => {
      drive.writes += 1;
      drive.remote = content as ProgressMap;
      drive.modifiedTime = `2026-09-20T1${drive.writes}:00:00.000Z`;
      return { modifiedTime: drive.modifiedTime };
    }),
  };
  return drive;
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`sync-test-${counter}`);
});

describe('syncNow', () => {
  it('створює віддалений файл, коли його ще немає', async () => {
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));

    await createSyncEngine(db, drive).syncNow();

    expect(drive.writeAppData).toHaveBeenCalledWith(PROGRESS_FILE, { v1: rec(100, 10) });
  });

  it('вливає віддалені записи в локальну базу', async () => {
    const drive = fakeDrive({ v2: rec(200, 50) });
    await db.putProgressRecord('v1', rec(100, 10));

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(Object.keys(merged).sort()).toEqual(['v1', 'v2']);
    await expect(db.getProgress()).resolves.toHaveProperty('v2');
  });

  it('свіжіший віддалений запис перемагає локальний', async () => {
    const drive = fakeDrive({ v1: rec(500, 90) });
    await db.putProgressRecord('v1', rec(100, 10));

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(merged.v1?.positionSec).toBe(90);
  });

  it('свіжіший локальний запис виштовхується у віддалений файл', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    await db.putProgressRecord('v1', rec(500, 90));

    await createSyncEngine(db, drive).syncNow();

    expect(drive.remote?.v1?.positionSec).toBe(90);
  });

  it('не завантажує файл повторно, якщо modifiedTime не змінився', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    const engine = createSyncEngine(db, drive);

    await engine.syncNow();
    const afterFirst = drive.downloads;
    await engine.syncNow();

    expect(drive.downloads).toBe(afterFirst);
  });

  it('завантажує файл заново, коли modifiedTime змінився на іншому пристрої', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    const engine = createSyncEngine(db, drive);
    await engine.syncNow();

    drive.remote = { v1: rec(900, 99) };
    drive.modifiedTime = '2026-09-21T10:00:00.000Z';
    const merged = await engine.syncNow();

    expect(merged.v1?.positionSec).toBe(99);
  });

  it('не пише у Drive, коли нічого не змінилося', async () => {
    const drive = fakeDrive({ v1: rec(100, 10) });
    await db.replaceProgress({ v1: rec(100, 10) });
    const engine = createSyncEngine(db, drive);

    await engine.syncNow();
    const afterFirst = drive.writes;
    await engine.syncNow();

    expect(drive.writes).toBe(afterFirst);
  });

  it('ігнорує зламані записи у віддаленому файлі, не втрачаючи решту', async () => {
    const drive = fakeDrive({
      good: rec(100, 10),
      broken: { positionSec: 'ой' } as unknown as ProgressRecord,
    });

    const merged = await createSyncEngine(db, drive).syncNow();

    expect(merged).toHaveProperty('good');
    expect(merged).not.toHaveProperty('broken');
  });

  it('переживає віддалений вміст, що взагалі не є обʼєктом', async () => {
    const drive = fakeDrive({} as ProgressMap);
    drive.readAppData = vi.fn(async () => ({
      content: 'не той формат',
      modifiedTime: drive.modifiedTime,
    }));

    await expect(createSyncEngine(db, drive).syncNow()).resolves.toEqual({});
  });
});

describe('scheduleSync і flush', () => {
  it('scheduleSync не синхронізує одразу, а після дебоунсу', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    expect(drive.writeAppData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('кілька scheduleSync підряд дають одну синхронізацію', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(4_000);
    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(4_000);
    engine.scheduleSync();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flush синхронізує негайно, скасовуючи відкладений таймер', async () => {
    vi.useFakeTimers();
    const drive = fakeDrive(null);
    await db.putProgressRecord('v1', rec(100, 10));
    const engine = createSyncEngine(db, drive, { debounceMs: 10_000 });

    engine.scheduleSync();
    await engine.flush();
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(drive.writeAppData).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('помилка синхронізації не валить застосунок', async () => {
    const drive = fakeDrive(null);
    drive.statAppData = vi.fn(async () => {
      throw new Error('офлайн');
    });
    await expect(createSyncEngine(db, drive).flush()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/storage/syncEngine.test.ts`
Expected: FAIL — `Failed to resolve import "./syncEngine"`.

- [ ] **Step 3: Реалізувати синхронізатор**

> **Увага: умова пушу в коді нижче хибна.** Реалізація (`src/storage/syncEngine.ts`,
> коміт `fcd15b7`) свідомо від неї відходить за рішенням людини.
>
> Було: `mustPush = stat === null || (remoteChanged && !sameProgress(merged, remote))`.
> `remoteChanged` означає «чи писав у Drive **інший** пристрій», а не «чи змінився наш
> локальний прогрес». Тому після першого успішного пушу, поки жоден інший пристрій файл
> не чіпав, пуш не відбувався **ніколи** — крос-девайс синхронізація не працювала
> у найзвичайнішому сценарії. Жоден із 14 тестів цього не бачив: єдиний тест на
> «локальне виштовхується» проходив лише тому, що був першим синком у житті бази.
>
> Стало: після успішного `writeAppData` останній відправлений знімок зберігається в
> `meta` під ключем `pushedProgress`, а умова — `stat === null ||
> !sameProgress(merged, pushed)`. Читається буквально: «пушити, якщо те, що ми
> відправили б, не дорівнює тому, що відправили минулого разу».
>
> Також до `isProgressRecord` додано перевірку діапазонів (`Number.isFinite`,
> невідʼємність) — файл у Drive поза контролем застосунку. Читайте файл, не цей блок.


`src/storage/syncEngine.ts`:

```ts
import { mergeProgress } from './mergeProgress';
import type { LearnerDb } from './db';
import type { DriveApi } from '../drive/api';
import type { ProgressMap, ProgressRecord } from '../types';

export const PROGRESS_FILE = 'learner-progress.json';
export const SYNC_DEBOUNCE_MS = 10_000;

const REMOTE_MODIFIED_KEY = 'remoteModifiedTime';

export type SyncEngine = {
  syncNow(): Promise<ProgressMap>;
  scheduleSync(): void;
  flush(): Promise<void>;
};

function isProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.positionSec === 'number' &&
    typeof r.completed === 'boolean' &&
    typeof r.updatedAt === 'number' &&
    (r.durationSec === null || typeof r.durationSec === 'number')
  );
}

/**
 * Віддалений файл міг записати старіша версія застосунку або зіпсувати збій.
 * Зламані записи відкидаємо поштучно, щоб не втратити решту прогресу.
 */
function parseProgress(content: unknown): ProgressMap {
  if (typeof content !== 'object' || content === null) return {};
  const out: ProgressMap = {};
  for (const [fileId, value] of Object.entries(content as Record<string, unknown>)) {
    if (isProgressRecord(value)) out[fileId] = value;
  }
  return out;
}

function sameProgress(a: ProgressMap, b: ProgressMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right !== undefined &&
      left!.positionSec === right.positionSec &&
      left!.completed === right.completed &&
      left!.updatedAt === right.updatedAt &&
      left!.durationSec === right.durationSec
    );
  });
}

export function createSyncEngine(
  db: LearnerDb,
  api: DriveApi,
  options: { debounceMs?: number } = {},
): SyncEngine {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<ProgressMap> | null = null;

  async function run(): Promise<ProgressMap> {
    const local = await db.getProgress();
    const stat = await api.statAppData(PROGRESS_FILE);
    const lastSeen = await db.getMeta<string>(REMOTE_MODIFIED_KEY);

    // Файл не змінився з нашого останнього злиття — тягнути його немає сенсу.
    const remoteChanged = stat !== null && stat.modifiedTime !== lastSeen;

    let remote: ProgressMap = {};
    if (remoteChanged) {
      const payload = await api.readAppData(PROGRESS_FILE);
      remote = parseProgress(payload?.content);
    }

    const merged = mergeProgress(local, remote);

    if (!sameProgress(merged, local)) {
      await db.replaceProgress(merged);
    }

    const mustPush = stat === null || (remoteChanged && !sameProgress(merged, remote));
    if (mustPush) {
      const { modifiedTime } = await api.writeAppData(PROGRESS_FILE, merged);
      await db.setMeta(REMOTE_MODIFIED_KEY, modifiedTime);
    } else if (stat !== null) {
      await db.setMeta(REMOTE_MODIFIED_KEY, stat.modifiedTime);
    }

    return merged;
  }

  function syncNow(): Promise<ProgressMap> {
    // Один прохід за раз: паралельні злиття могли б перезаписати одне одного.
    if (running) return running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    syncNow,

    scheduleSync() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // Мережа може бути відсутня — це нормальний стан, не помилка застосунку.
        void syncNow().catch(() => {});
      }, debounceMs);
    },

    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        await syncNow();
      } catch {
        // Прогрес уже в IndexedDB; злиття відбудеться при наступному запуску.
      }
    },
  };
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/storage/syncEngine.test.ts`
Expected: PASS, 13 тестів.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: синхронізація прогресу через Drive appDataFolder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Продакшн Service Worker і визначення можливостей

Переносимо перевірену в Задачі 2 форму проксі в продакшн, підключаємо PWA і видаляємо код спайка.

**Files:**
- Create: `src/sw/service-worker.ts`
- Create: `src/player/useMediaCapability.ts`
- Test: `src/player/useMediaCapability.test.ts`
- Modify: `vite.config.ts` (додати `VitePWA`)
- Create: `src/sw/publishToken.ts`
- Delete: `spike.html`, `public/sw-spike.js`

**Interfaces:**
- Consumes: `TokenClient` із `src/auth/tokenClient.ts`.
- Produces:
  - маршрут `/media/{fileId}` на власному origin, що віддає байти відео з Drive
  - `mediaUrl(fileId: string): string`
  - `type MediaCapability = 'proxy' | 'fallback'`
  - `detectInitialCapability(hasServiceWorker: boolean, stored: string | null): MediaCapability`
  - `useMediaCapability(): { capability: MediaCapability; markProxyUnsupported(): void }`
  - `publishTokenToServiceWorker(token: string): void`

- [ ] **Step 1: Поставити workbox-precaching**

```bash
npm i -D workbox-precaching
```

- [ ] **Step 2: Написати падаючі тести на визначення можливостей**

`src/player/useMediaCapability.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAPABILITY_STORAGE_KEY,
  detectInitialCapability,
  mediaUrl,
  useMediaCapability,
} from './useMediaCapability';

describe('mediaUrl', () => {
  it('будує маршрут на власному origin', () => {
    expect(mediaUrl('abc123')).toBe('/media/abc123');
  });
});

describe('detectInitialCapability', () => {
  it('без Service Worker одразу fallback', () => {
    expect(detectInitialCapability(false, null)).toBe('fallback');
  });

  it('із Service Worker і без збереженого вердикту — proxy', () => {
    expect(detectInitialCapability(true, null)).toBe('proxy');
  });

  it('поважає збережений вердикт fallback', () => {
    expect(detectInitialCapability(true, 'fallback')).toBe('fallback');
  });

  it('ігнорує сміття в сховищі й пробує proxy', () => {
    expect(detectInitialCapability(true, 'хтозна')).toBe('proxy');
  });
});

describe('useMediaCapability', () => {
  beforeEach(() => localStorage.clear());

  it('markProxyUnsupported перемикає на fallback і запамʼятовує вибір', () => {
    const { result } = renderHook(() => useMediaCapability());
    expect(result.current.capability).toBe('proxy');

    act(() => result.current.markProxyUnsupported());

    expect(result.current.capability).toBe('fallback');
    expect(localStorage.getItem(CAPABILITY_STORAGE_KEY)).toBe('fallback');
  });

  it('після перезапуску не пробує proxy знову', () => {
    localStorage.setItem(CAPABILITY_STORAGE_KEY, 'fallback');
    const { result } = renderHook(() => useMediaCapability());
    expect(result.current.capability).toBe('fallback');
  });
});
```

- [ ] **Step 3: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/player/useMediaCapability.test.ts`
Expected: FAIL — `Failed to resolve import "./useMediaCapability"`.

- [ ] **Step 4: Реалізувати визначення можливостей**

`src/player/useMediaCapability.ts`:

```ts
import { useCallback, useState } from 'react';

export const CAPABILITY_STORAGE_KEY = 'learner.mediaCapability';

export type MediaCapability = 'proxy' | 'fallback';

/** Маршрут, який перехоплює Service Worker і проксує в Drive. */
export function mediaUrl(fileId: string): string {
  return `/media/${fileId}`;
}

export function detectInitialCapability(
  hasServiceWorker: boolean,
  stored: string | null,
): MediaCapability {
  if (!hasServiceWorker) return 'fallback';
  return stored === 'fallback' ? 'fallback' : 'proxy';
}

function readStored(): string | null {
  // Приватний режим може кидати на доступі до localStorage.
  try {
    return localStorage.getItem(CAPABILITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Вердикт визначається на живому файлі: плеєр повідомляє про провал, і ми
 * запамʼятовуємо fallback, щоб не мучити користувача паузою на кожному уроці.
 */
export function useMediaCapability(): {
  capability: MediaCapability;
  markProxyUnsupported(): void;
} {
  const [capability, setCapability] = useState<MediaCapability>(() =>
    detectInitialCapability('serviceWorker' in navigator, readStored()),
  );

  const markProxyUnsupported = useCallback(() => {
    setCapability('fallback');
    try {
      localStorage.setItem(CAPABILITY_STORAGE_KEY, 'fallback');
    } catch {
      // Вердикт лишиться в памʼяті на цю сесію — цього достатньо.
    }
  }, []);

  return { capability, markProxyUnsupported };
}
```

- [ ] **Step 5: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/player/useMediaCapability.test.ts`
Expected: PASS, 7 тестів.

- [ ] **Step 6: Написати продакшн Service Worker**

`src/sw/service-worker.ts`:

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Оболонка застосунку кешується, тому бібліотека курсів відкривається офлайн.
precacheAndRoute(self.__WB_MANIFEST);

const MEDIA_PREFIX = '/media/';

/** Заголовки, без яких медіа-елемент не вміє ні тривалість, ні перемотку. */
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'etag'];

let accessToken: string | null = null;

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; token?: string } | null;
  if (data?.type === 'SET_TOKEN' && typeof data.token === 'string') {
    accessToken = data.token;
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  // Чіпаємо ТІЛЬКИ власний медіа-маршрут: решту запитів не торкаємо.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(MEDIA_PREFIX)) return;

  event.respondWith(proxyMedia(event.request, url.pathname.slice(MEDIA_PREFIX.length)));
});

async function proxyMedia(request: Request, fileId: string): Promise<Response> {
  if (!accessToken) {
    return new Response('Немає токена доступу', { status: 401 });
  }

  const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers },
  );

  const out = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('accept-ranges', 'bytes');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
```

- [ ] **Step 7: Підключити PWA у конфіг Vite**

Замінити вміст `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest, а не generateSW: Service Worker містить власну логіку проксі.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      manifest: {
        name: 'Learner — відеокурси з Google Drive',
        short_name: 'Learner',
        description: 'Відеокурси з Google Drive із відстеженням прогресу',
        lang: 'uk',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: { host: true, allowedHosts: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Покласти в `public/` два PNG-іконки `icon-192.png` і `icon-512.png` — будь-яке просте зображення з літерою «L» на темному тлі.

- [ ] **Step 8: Додати трансляцію токена у воркер**

Створити окремий модуль (не в `main.tsx`: його імпортує ще й `app/services.ts`):

`src/sw/publishToken.ts`:

```ts
/**
 * Воркер не має доступу до GIS, тому токен йому надсилає сторінка —
 * при вході й при кожному тихому поновленні.
 */
export function publishTokenToServiceWorker(token: string): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: 'SET_TOKEN', token });
}
```

- [ ] **Step 9: Видалити код спайка**

```bash
git rm spike.html public/sw-spike.js
```

Прибрати `'./spike.html'` зі списку `content` у `tailwind.config.js` — файл більше не існує.

Вердикт спайка лишається в `docs/superpowers/plans/2026-09-20-spike-result.md` — це вже документація, а не код.

- [ ] **Step 10: Перевірити збірку й тести**

Run: `npm run build && npm test`
Expected: збірка проходить, у `dist/` зʼявляється `sw.js`, усі тести зелені.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: продакшн Service Worker із медіа-проксі та PWA-манифест

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Плеєр і fallback

**Files:**
- Create: `src/player/VideoPlayer.tsx`, `src/player/FallbackPlayer.tsx`
- Test: `src/player/VideoPlayer.test.tsx`, `src/player/FallbackPlayer.test.tsx`

**Interfaces:**
- Consumes: `mediaUrl` із `src/player/useMediaCapability.ts`, `shouldAutoComplete` із `src/progress/aggregate.ts`.
- Produces:
  - `const POSITION_THROTTLE_MS = 5_000`, `const METADATA_TIMEOUT_MS = 6_000`
  - `type VideoPlayerProps = { fileId: string; initialPositionSec: number; onProgress(positionSec: number, durationSec: number): void; onCompleted(): void; onEnded(): void; onUnsupported(): void }`
  - `type FallbackPlayerProps = { fileId: string; completed: boolean; onToggleCompleted(): void }`

- [ ] **Step 1: Написати падаючі тести плеєра**

`src/player/VideoPlayer.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

/** jsdom не відтворює медіа, тому duration і currentTime підміняємо вручну. */
function stubMedia(video: HTMLVideoElement, duration: number) {
  let current = 0;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => current,
    set: (v: number) => {
      current = v;
    },
  });
  video.play = vi.fn(async () => {});
  video.pause = vi.fn();
  return {
    seekTo(seconds: number) {
      current = seconds;
    },
  };
}

function setup(props: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  const handlers = {
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
    onEnded: vi.fn(),
    onUnsupported: vi.fn(),
  };
  const view = render(
    <VideoPlayer fileId="file-1" initialPositionSec={0} {...handlers} {...props} />,
  );
  const video = view.container.querySelector('video')!;
  return { ...handlers, video, view };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('VideoPlayer', () => {
  it('тягне відео через маршрут медіа-проксі', () => {
    const { video } = setup();
    expect(video.getAttribute('src')).toBe('/media/file-1');
  });

  it('відновлює позицію після loadedmetadata', () => {
    const { video } = setup({ initialPositionSec: 125 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(125);
  });

  it('не перемотує, якщо збереженої позиції немає', () => {
    const { video } = setup({ initialPositionSec: 0 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0);
  });

  it('не перемотує в самий кінець, коли відео вже було додивлене', () => {
    // Інакше повторне відкриття завершеного відео відкривалося б на титрах.
    const { video } = setup({ initialPositionSec: 599 });
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0);
  });

  it('повідомляє позицію не частіше ніж раз на 5 секунд', () => {
    const { video, onProgress } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(10);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(1);

    media.seekTo(11);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(20);
    fireEvent(video, new Event('timeupdate'));
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(20, 600);
  });

  it('повідомляє позицію негайно на pause, минаючи тротлінг', () => {
    const { video, onProgress } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    onProgress.mockClear();

    media.seekTo(33);
    fireEvent(video, new Event('pause'));
    expect(onProgress).toHaveBeenCalledWith(33, 600);
  });

  it('викликає onCompleted на 90% тривалості', () => {
    const { video, onCompleted } = setup();
    const media = stubMedia(video, 100);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(89);
    fireEvent(video, new Event('timeupdate'));
    expect(onCompleted).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(90);
    fireEvent(video, new Event('timeupdate'));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('не викликає onCompleted повторно', () => {
    const { video, onCompleted } = setup();
    const media = stubMedia(video, 100);
    fireEvent(video, new Event('loadedmetadata'));

    media.seekTo(95);
    fireEvent(video, new Event('timeupdate'));
    act(() => vi.advanceTimersByTime(5_000));
    media.seekTo(99);
    fireEvent(video, new Event('timeupdate'));

    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('викликає onUnsupported на помилці завантаження', () => {
    const { video, onUnsupported } = setup();
    fireEvent(video, new Event('error'));
    expect(onUnsupported).toHaveBeenCalledTimes(1);
  });

  it('викликає onUnsupported, якщо метадані не прийшли за 6 секунд', () => {
    const { onUnsupported } = setup();
    act(() => vi.advanceTimersByTime(6_000));
    expect(onUnsupported).toHaveBeenCalledTimes(1);
  });

  it('не викликає onUnsupported, якщо метадані встигли прийти', () => {
    const { video, onUnsupported } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(onUnsupported).not.toHaveBeenCalled();
  });

  it('змінює швидкість відтворення вибором зі списку', () => {
    const { video, view } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    fireEvent.change(view.getByLabelText('Швидкість'), { target: { value: '1.5' } });
    expect(video.playbackRate).toBe(1.5);
  });

  it('пробіл ставить на паузу і знімає з неї', () => {
    const { video } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    Object.defineProperty(video, 'paused', { configurable: true, get: () => true });
    fireEvent.keyDown(window, { key: ' ' });
    expect(video.play).toHaveBeenCalled();
  });

  it('стрілки перемотують на 5 секунд', () => {
    const { video } = setup();
    const media = stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));
    media.seekTo(50);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(55);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(50);
  });

  it('не перехоплює клавіші, коли фокус у полі введення', () => {
    const { video } = setup();
    stubMedia(video, 600);
    fireEvent(video, new Event('loadedmetadata'));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: ' ' });

    expect(video.play).not.toHaveBeenCalled();
    input.remove();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/player/VideoPlayer.test.tsx`
Expected: FAIL — `Failed to resolve import "./VideoPlayer"`.

- [ ] **Step 3: Реалізувати VideoPlayer**

`src/player/VideoPlayer.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from './useMediaCapability';
import { shouldAutoComplete } from '../progress/aggregate';

export const POSITION_THROTTLE_MS = 5_000;
export const METADATA_TIMEOUT_MS = 6_000;
const SEEK_STEP_SEC = 5;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Позицію майже в кінці не відновлюємо: інакше відео відкривалося б на титрах. */
const RESUME_MAX_RATIO = 0.98;

export type VideoPlayerProps = {
  fileId: string;
  initialPositionSec: number;
  onProgress(positionSec: number, durationSec: number): void;
  onCompleted(): void;
  onEnded(): void;
  onUnsupported(): void;
};

export function VideoPlayer({
  fileId,
  initialPositionSec,
  onProgress,
  onCompleted,
  onEnded,
  onUnsupported,
}: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastReportRef = useRef(0);
  const completedRef = useRef(false);
  const readyRef = useRef(false);
  const [speed, setSpeed] = useState(1);

  const report = useCallback(
    (force: boolean) => {
      const video = ref.current;
      if (!video || !readyRef.current) return;

      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const now = Date.now();
      if (!force && now - lastReportRef.current < POSITION_THROTTLE_MS) return;
      lastReportRef.current = now;

      onProgress(video.currentTime, duration);

      if (!completedRef.current && shouldAutoComplete(video.currentTime, duration)) {
        completedRef.current = true;
        onCompleted();
      }
    },
    [onCompleted, onProgress],
  );

  // Якщо метадані не прийшли за відведений час — проксі не працює на цій платформі.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) onUnsupported();
    }, METADATA_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fileId, onUnsupported]);

  // Новий урок — новий відлік: інакше стан попереднього відео протік би в наступне.
  useEffect(() => {
    readyRef.current = false;
    completedRef.current = false;
    lastReportRef.current = 0;
  }, [fileId]);

  const handleLoadedMetadata = useCallback(() => {
    const video = ref.current;
    if (!video) return;
    readyRef.current = true;

    const duration = video.duration;
    if (
      initialPositionSec > 0 &&
      Number.isFinite(duration) &&
      initialPositionSec < duration * RESUME_MAX_RATIO
    ) {
      video.currentTime = initialPositionSec;
    }
    video.playbackRate = speed;
  }, [initialPositionSec, speed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Не крадемо клавіші в полів введення й у кнопок.
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;

      const video = ref.current;
      if (!video) return;

      if (event.key === ' ') {
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        video.currentTime = video.currentTime + SEEK_STEP_SEC;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SEC);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Закриття вкладки не має коштувати останніх хвилин перегляду.
  useEffect(() => {
    const flush = () => report(true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [report]);

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={ref}
        src={mediaUrl(fileId)}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg bg-black"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={() => report(false)}
        onPause={() => report(true)}
        onError={() => onUnsupported()}
        onEnded={() => {
          report(true);
          if (!completedRef.current) {
            completedRef.current = true;
            onCompleted();
          }
          onEnded();
        }}
      />
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        Швидкість
        <select
          aria-label="Швидкість"
          value={speed}
          className="rounded border border-zinc-300 px-2 py-1"
          onChange={(event) => {
            const value = Number(event.target.value);
            setSpeed(value);
            if (ref.current) ref.current.playbackRate = value;
          }}
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <span className="text-zinc-400">пробіл — пауза, ← → — 5 с</span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/player/VideoPlayer.test.tsx`
Expected: PASS, 15 тестів.

- [ ] **Step 5: Написати падаючі тести fallback-плеєра**

`src/player/FallbackPlayer.test.tsx`:

```tsx
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
```

- [ ] **Step 6: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/player/FallbackPlayer.test.tsx`
Expected: FAIL — `Failed to resolve import "./FallbackPlayer"`.

- [ ] **Step 7: Реалізувати FallbackPlayer**

`src/player/FallbackPlayer.tsx`:

```tsx
export type FallbackPlayerProps = {
  fileId: string;
  completed: boolean;
  onToggleCompleted(): void;
};

/**
 * Відкіт для платформ, де медіа-проксі не працює. Плеєр Drive у iframe —
 * cross-origin, тому позиція й тривалість недоступні, і відмітка лишається ручною.
 */
export function FallbackPlayer({ fileId, completed, onToggleCompleted }: FallbackPlayerProps) {
  return (
    <div className="flex flex-col gap-3">
      <iframe
        title="Відео курсу"
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        allow="autoplay"
        allowFullScreen
        className="aspect-video w-full rounded-lg bg-black"
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggleCompleted}
          className="h-4 w-4"
        />
        Переглянуто
      </label>
      <p role="note" className="text-sm text-zinc-500">
        На цьому пристрої використовується вбудований плеєр Google Drive, тому позиція перегляду
        не зберігається — відмічайте уроки вручну.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/player/FallbackPlayer.test.tsx`
Expected: PASS, 4 тести.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: плеєр із resume, швидкістю й хоткеями та iframe-відкіт

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Стан застосунку і збірка сервісів

Сторінки в цьому плані — презентаційні: отримують дані й колбеки пропсами. Стан живе тут, зшивання зі сторінками — у Задачі 16. Так кожна сторінка тестується без моків IndexedDB і мережі.

**Files:**
- Create: `src/store/useStore.ts`, `src/app/services.ts`
- Test: `src/store/useStore.test.ts`

**Interfaces:**
- Consumes: `LearnerDb`, `DriveApi`, `SyncEngine`, `scanCourse`, `parseFolderId`, `shouldAutoComplete`.
- Produces:
  - `type StoreDeps = { db: LearnerDb; api: DriveApi; sync: SyncEngine; now?: () => number }`
  - `type LearnerState = { courses: Course[]; progress: ProgressMap; ready: boolean; error: string | null; init(): Promise<void>; addCourse(input: string): Promise<Course>; removeCourse(id: string): Promise<void>; rescanCourse(id: string): Promise<void>; setPosition(fileId: string, positionSec: number, durationSec: number | null): Promise<void>; setCompleted(fileId: string, completed: boolean): Promise<void> }`
  - `createLearnerStore(deps: StoreDeps): UseBoundStore<StoreApi<LearnerState>>`
  - `createServices(): Promise<StoreDeps & { tokenClient: TokenClient }>`

- [ ] **Step 1: Написати падаючі тести**

`src/store/useStore.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLearnerStore } from './useStore';
import { openLearnerDb } from '../storage/db';
import { DriveError } from '../drive/api';
import { COURSE_LISTING, ROOT_FILE, ROOT_ID } from '../test/fixtures/driveCourse';
import type { LearnerDb } from '../storage/db';
import type { DriveApi } from '../drive/api';
import type { SyncEngine } from '../storage/syncEngine';
import type { ProgressMap } from '../types';

function fakeApi(): DriveApi {
  return {
    listFolder: vi.fn(async (id: string) => COURSE_LISTING[id] ?? []),
    getFile: vi.fn(async () => ROOT_FILE),
    statAppData: vi.fn(async () => null),
    readAppData: vi.fn(async () => null),
    writeAppData: vi.fn(async () => ({ modifiedTime: '' })),
  };
}

function fakeSync(merged: ProgressMap = {}): SyncEngine {
  return {
    syncNow: vi.fn(async () => merged),
    scheduleSync: vi.fn(),
    flush: vi.fn(async () => {}),
  };
}

let db: LearnerDb;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = await openLearnerDb(`store-test-${counter}`);
});

describe('init', () => {
  it('піднімає курси й прогрес зі сховища', async () => {
    await db.putProgressRecord('v1', {
      positionSec: 5,
      durationSec: 100,
      completed: false,
      updatedAt: 1,
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().progress.v1?.positionSec).toBe(5);
  });

  it('вливає результат синхронізації в стан', async () => {
    const sync = fakeSync({
      remote: { positionSec: 50, durationSec: 100, completed: false, updatedAt: 9 },
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync });

    await store.getState().init();

    expect(store.getState().progress.remote?.positionSec).toBe(50);
  });

  it('готовий до роботи навіть коли синхронізація впала', async () => {
    const sync = fakeSync();
    sync.syncNow = vi.fn(async () => {
      throw new Error('офлайн');
    });
    const store = createLearnerStore({ db, api: fakeApi(), sync });

    await store.getState().init();

    expect(store.getState().ready).toBe(true);
  });
});

describe('addCourse', () => {
  it('додає курс за посиланням на папку', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await store.getState().addCourse(`https://drive.google.com/drive/folders/${ROOT_ID}`);

    expect(store.getState().courses).toHaveLength(1);
    expect(store.getState().courses[0]?.title).toBe('Product Management Course');
    await expect(db.getCourses()).resolves.toHaveLength(1);
  });

  it('відмовляється від посилання, що не є папкою, зі зрозумілим текстом', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse('https://example.com/щось')).rejects.toThrow(
      /посилання на папку/i,
    );
    expect(store.getState().courses).toHaveLength(0);
  });

  it('перетворює 404 від Drive у зрозумілу підказку про доступ', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new DriveError(404, 'Drive API 404 Not Found');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/не знайдено|доступ/i);
  });

  it('перетворює 403 від Drive у підказку про права доступу', async () => {
    const api = fakeApi();
    api.getFile = vi.fn(async () => {
      throw new DriveError(403, 'Drive API 403 Forbidden');
    });
    const store = createLearnerStore({ db, api, sync: fakeSync() });
    await store.getState().init();

    await expect(store.getState().addCourse(ROOT_ID)).rejects.toThrow(/доступ/i);
  });

  it('повторне додавання того самого курсу не створює дубль', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();

    await store.getState().addCourse(ROOT_ID);
    await store.getState().addCourse(ROOT_ID);

    expect(store.getState().courses).toHaveLength(1);
  });
});

describe('removeCourse', () => {
  it('прибирає курс, але зберігає прогрес', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync() });
    await store.getState().init();
    await store.getState().addCourse(ROOT_ID);
    await store.getState().setPosition('v-funnel', 42, 600);

    await store.getState().removeCourse(ROOT_ID);

    expect(store.getState().courses).toHaveLength(0);
    await expect(db.getProgress()).resolves.toHaveProperty('v-funnel');
  });
});

describe('setPosition', () => {
  it('записує позицію й тривалість і планує синхронізацію', async () => {
    const sync = fakeSync();
    const store = createLearnerStore({ db, api: fakeApi(), sync, now: () => 1000 });
    await store.getState().init();

    await store.getState().setPosition('v1', 42, 600);

    expect(store.getState().progress.v1).toEqual({
      positionSec: 42,
      durationSec: 600,
      completed: false,
      updatedAt: 1000,
    });
    expect(sync.scheduleSync).toHaveBeenCalled();
  });

  it('не скидає позначку «переглянуто» при перезаписі позиції', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setCompleted('v1', true);

    await store.getState().setPosition('v1', 10, 600);

    expect(store.getState().progress.v1?.completed).toBe(true);
  });

  it('зберігає вже відому тривалість, коли плеєр передав null', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 1 });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    await store.getState().setPosition('v1', 20, null);

    expect(store.getState().progress.v1?.durationSec).toBe(600);
  });
});

describe('setCompleted', () => {
  it('ручна відмітка перебиває автоматичну й в обидва боки', async () => {
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => 5 });
    await store.getState().init();

    await store.getState().setCompleted('v1', true);
    expect(store.getState().progress.v1?.completed).toBe(true);

    await store.getState().setCompleted('v1', false);
    expect(store.getState().progress.v1?.completed).toBe(false);
  });

  it('оновлює updatedAt, щоб відмітка перемогла при злитті', async () => {
    let clock = 100;
    const store = createLearnerStore({ db, api: fakeApi(), sync: fakeSync(), now: () => clock });
    await store.getState().init();
    await store.getState().setPosition('v1', 10, 600);

    clock = 900;
    await store.getState().setCompleted('v1', true);

    expect(store.getState().progress.v1?.updatedAt).toBe(900);
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/store/useStore.test.ts`
Expected: FAIL — `Failed to resolve import "./useStore"`.

- [ ] **Step 3: Реалізувати стан**

`src/store/useStore.ts`:

```ts
import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { DriveError } from '../drive/api';
import { scanCourse } from '../drive/courseScanner';
import { parseFolderId } from '../drive/parseFolderUrl';
import type { DriveApi } from '../drive/api';
import type { LearnerDb } from '../storage/db';
import type { SyncEngine } from '../storage/syncEngine';
import type { Course, ProgressMap, ProgressRecord } from '../types';

export type StoreDeps = {
  db: LearnerDb;
  api: DriveApi;
  sync: SyncEngine;
  now?: () => number;
};

export type LearnerState = {
  courses: Course[];
  progress: ProgressMap;
  ready: boolean;
  error: string | null;
  init(): Promise<void>;
  addCourse(input: string): Promise<Course>;
  removeCourse(id: string): Promise<void>;
  rescanCourse(id: string): Promise<void>;
  setPosition(fileId: string, positionSec: number, durationSec: number | null): Promise<void>;
  setCompleted(fileId: string, completed: boolean): Promise<void>;
};

export function createLearnerStore(
  deps: StoreDeps,
): UseBoundStore<StoreApi<LearnerState>> {
  const { db, api, sync } = deps;
  const now = deps.now ?? (() => Date.now());

  return create<LearnerState>((set, get) => {
    /** Пише запис і локально, і в IndexedDB, і планує злиття у Drive. */
    async function writeRecord(fileId: string, record: ProgressRecord): Promise<void> {
      await db.putProgressRecord(fileId, record);
      set({ progress: { ...get().progress, [fileId]: record } });
      sync.scheduleSync();
    }

    return {
      courses: [],
      progress: {},
      ready: false,
      error: null,

      async init() {
        const [courses, progress] = await Promise.all([db.getCourses(), db.getProgress()]);
        set({ courses, progress });

        // Синхронізація — покращення, а не умова запуску: офлайн застосунок мусить працювати.
        try {
          const merged = await sync.syncNow();
          set({ progress: merged });
        } catch {
          // Локальні дані вже в стані; злиття відбудеться при наступній нагоді.
        }

        set({ ready: true });
      },

      async addCourse(input) {
        const folderId = parseFolderId(input);
        if (!folderId) {
          throw new Error('Потрібне посилання на папку Google Drive або її ID');
        }

        // «Drive API 404» користувачеві нічого не каже — перекладаємо на людську мову.
        const course = await scanCourse(api, folderId, now()).catch((cause: unknown) => {
          if (cause instanceof DriveError && (cause.status === 404 || cause.status === 403)) {
            throw new Error(
              'Папку не знайдено або до неї немає доступу. Перевірте посилання і те, ' +
                'що папкою поділилися з вашим акаунтом.',
            );
          }
          throw cause;
        });
        await db.putCourse(course);
        set({
          courses: [...get().courses.filter((c) => c.id !== course.id), course],
          error: null,
        });
        return course;
      },

      async removeCourse(id) {
        // Прогрес не чіпаємо: це єдині дані, які нізвідки не відновити.
        await db.deleteCourse(id);
        set({ courses: get().courses.filter((c) => c.id !== id) });
      },

      async rescanCourse(id) {
        const existing = get().courses.find((c) => c.id === id);
        const scanned = await scanCourse(api, id, now());
        const course: Course = { ...scanned, addedAt: existing?.addedAt ?? scanned.addedAt };
        await db.putCourse(course);
        set({ courses: get().courses.map((c) => (c.id === id ? course : c)) });
      },

      async setPosition(fileId, positionSec, durationSec) {
        const previous = get().progress[fileId];
        await writeRecord(fileId, {
          positionSec,
          // Тривалість, яку вже знаємо, не затираємо новим null.
          durationSec: durationSec ?? previous?.durationSec ?? null,
          completed: previous?.completed ?? false,
          updatedAt: now(),
        });
      },

      async setCompleted(fileId, completed) {
        const previous = get().progress[fileId];
        await writeRecord(fileId, {
          positionSec: previous?.positionSec ?? 0,
          durationSec: previous?.durationSec ?? null,
          completed,
          updatedAt: now(),
        });
      },
    };
  });
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/store/useStore.test.ts`
Expected: PASS, 14 тестів.

- [ ] **Step 5: Зібрати сервіси для реального застосунку**

`src/app/services.ts`:

```ts
import { createTokenClient } from '../auth/tokenClient';
import { createDriveApi } from '../drive/api';
import { openLearnerDb } from '../storage/db';
import { createSyncEngine } from '../storage/syncEngine';
import { publishTokenToServiceWorker } from '../sw/publishToken';
import type { TokenClient } from '../auth/tokenClient';
import type { StoreDeps } from '../store/useStore';

export async function createServices(): Promise<StoreDeps & { tokenClient: TokenClient }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('Не задано VITE_GOOGLE_CLIENT_ID — див. docs/google-cloud-setup.md');
  }

  const tokenClient = createTokenClient(clientId);

  // Воркер не має доступу до GIS, тому щоразу, коли токен проходить через нас,
  // пересилаємо його — і при першому вході, і при кожному тихому поновленні.
  const getToken = async () => {
    const token = await tokenClient.getToken();
    publishTokenToServiceWorker(token);
    return token;
  };

  const db = await openLearnerDb();
  const api = createDriveApi(getToken);
  const sync = createSyncEngine(db, api);

  return { db, api, sync, tokenClient };
}
```

- [ ] **Step 6: Перевірити типізацію**

Run: `npm run build`
Expected: без помилок TypeScript.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: стан застосунку і збірка сервісів

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Бібліотека курсів

**Files:**
- Create: `src/ui/ProgressBar.tsx`, `src/ui/AddCourseDialog.tsx`, `src/ui/LibraryPage.tsx`
- Test: `src/ui/ProgressBar.test.tsx`, `src/ui/LibraryPage.test.tsx`

**Interfaces:**
- Consumes: `aggregate` із `src/progress/aggregate.ts`; типи `Course`, `ProgressMap`.
- Produces:
  - `ProgressBar({ ratio, approximate }: { ratio: number; approximate?: boolean })`
  - `AddCourseDialog({ onSubmit }: { onSubmit(input: string): Promise<void> })`
  - `LibraryPage({ courses, progress, onAddCourse, onRemoveCourse }: { courses: Course[]; progress: ProgressMap; onAddCourse(input: string): Promise<void>; onRemoveCourse(id: string): void })`

- [ ] **Step 1: Написати падаючі тести**

`src/ui/ProgressBar.test.tsx`:

```tsx
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
```

`src/ui/LibraryPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';
import type { Course, ProgressMap } from '../types';

const course: Course = {
  id: 'c1',
  title: 'Product Management',
  addedAt: 1,
  lastScannedAt: 1,
  tree: {
    id: 'c1',
    kind: 'folder',
    title: 'Product Management',
    children: [
      { id: 'v1', kind: 'video', title: 'Один.mp4', durationSec: 100 },
      { id: 'v2', kind: 'video', title: 'Два.mp4', durationSec: 100 },
    ],
  },
};

function renderPage(over: Partial<Parameters<typeof LibraryPage>[0]> = {}) {
  const props = {
    courses: [course],
    progress: {} as ProgressMap,
    onAddCourse: vi.fn(async () => {}),
    onRemoveCourse: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <LibraryPage {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('LibraryPage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Product Management/ })).toBeInTheDocument();
  });

  it('показує загальний прогрес курсу за часом', () => {
    renderPage({
      progress: {
        v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 },
      },
    });
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('показує кількість переглянутих уроків', () => {
    renderPage({
      progress: {
        v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 },
      },
    });
    expect(screen.getByText(/1 з 2/)).toBeInTheDocument();
  });

  it('на порожній бібліотеці пояснює, що робити', () => {
    renderPage({ courses: [] });
    expect(screen.getByText(/додайте перший курс/i)).toBeInTheDocument();
  });

  it('додає курс за введеним посиланням', async () => {
    const props = renderPage();
    await userEvent.type(
      screen.getByLabelText(/посилання на папку/i),
      'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk',
    );
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(props.onAddCourse).toHaveBeenCalledWith(
      'https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk',
    );
  });

  it('показує помилку від onAddCourse, не ламаючи сторінку', async () => {
    renderPage({
      onAddCourse: vi.fn(async () => {
        throw new Error('Потрібне посилання на папку Google Drive або її ID');
      }),
    });
    await userEvent.type(screen.getByLabelText(/посилання на папку/i), 'сміття');
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/посилання на папку/i);
  });

  it('не викликає onAddCourse на порожньому полі', async () => {
    const props = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /додати курс/i }));
    expect(props.onAddCourse).not.toHaveBeenCalled();
  });

  it('прибирає курс після підтвердження', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /прибрати/i }));
    expect(props.onRemoveCourse).toHaveBeenCalledWith('c1');
  });

  it('не прибирає курс, якщо підтвердження скасували', async () => {
    const props = renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /прибрати/i }));
    expect(props.onRemoveCourse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/ui/ProgressBar.test.tsx src/ui/LibraryPage.test.tsx`
Expected: FAIL — імпорти не резолвляться.

- [ ] **Step 3: Реалізувати ProgressBar**

`src/ui/ProgressBar.tsx`:

```tsx
export type ProgressBarProps = {
  /** 0..1 */
  ratio: number;
  /** Відсоток порахований за кількістю відео, а не за часом. */
  approximate?: boolean;
};

export function ProgressBar({ ratio, approximate = false }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, ratio));
  // Округлення вниз: 99,6% не має виглядати як завершений курс.
  const percent = Math.floor(clamped * 100);

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
      >
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-sm tabular-nums text-zinc-600">
        {approximate ? '≈' : ''}
        {percent}%
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Реалізувати AddCourseDialog**

`src/ui/AddCourseDialog.tsx`:

```tsx
import { useState } from 'react';

export type AddCourseDialogProps = {
  onSubmit(input: string): Promise<void>;
};

export function AddCourseDialog({ onSubmit }: AddCourseDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося додати курс');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="folder-url" className="text-sm font-medium">
        Посилання на папку Google Drive
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="folder-url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Сканую…' : 'Додати курс'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Реалізувати LibraryPage**

`src/ui/LibraryPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { AddCourseDialog } from './AddCourseDialog';
import { ProgressBar } from './ProgressBar';
import { aggregate } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LibraryPageProps = {
  courses: Course[];
  progress: ProgressMap;
  onAddCourse(input: string): Promise<void>;
  onRemoveCourse(id: string): void;
};

export function LibraryPage({
  courses,
  progress,
  onAddCourse,
  onRemoveCourse,
}: LibraryPageProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Мої курси</h1>

      <AddCourseDialog onSubmit={onAddCourse} />

      {courses.length === 0 ? (
        <p className="text-zinc-500">
          Поки що порожньо — додайте перший курс, вставивши посилання на папку Google Drive.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {courses.map((course) => {
            const stats = aggregate(course.tree, progress);
            return (
              <li key={course.id} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    to={`/course/${course.id}`}
                    className="text-lg font-medium hover:underline"
                  >
                    {course.title}
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-zinc-500 hover:text-red-600"
                    onClick={() => {
                      if (window.confirm(`Прибрати «${course.title}» з бібліотеки?`)) {
                        onRemoveCourse(course.id);
                      }
                    }}
                  >
                    Прибрати
                  </button>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {stats.completedCount} з {stats.videoCount} уроків
                </p>
                <div className="mt-2">
                  <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/ui/ProgressBar.test.tsx src/ui/LibraryPage.test.tsx`
Expected: PASS, 14 тестів.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: бібліотека курсів із додаванням за посиланням

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Сторінка курсу і дерево розділів

**Files:**
- Create: `src/ui/TreeSection.tsx`, `src/ui/CoursePage.tsx`
- Test: `src/ui/CoursePage.test.tsx`

**Interfaces:**
- Consumes: `aggregate`, `findResumeVideoId` із `src/progress/aggregate.ts`; `ProgressBar`.
- Produces:
  - `TreeSection({ node, courseId, progress, depth }: { node: FolderNode; courseId: string; progress: ProgressMap; depth?: number })`
  - `CoursePage({ course, progress, onRescan }: { course: Course; progress: ProgressMap; onRescan(): void })`

- [ ] **Step 1: Написати падаючі тести**

`src/ui/CoursePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CoursePage } from './CoursePage';
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
      {
        id: 'm1',
        kind: 'folder',
        title: '01 - Модуль перший',
        children: [
          {
            id: 'm1s1',
            kind: 'folder',
            title: '1 - Розділ',
            children: [
              { id: 'v1', kind: 'video', title: 'Перше.mp4', durationSec: 100 },
              { id: 'v2', kind: 'video', title: 'Друге.mp4', durationSec: 100 },
            ],
          },
        ],
      },
      { id: 'v3', kind: 'video', title: 'Окремий урок.mp4', durationSec: 200 },
    ],
  },
};

function renderPage(progress: ProgressMap = {}, onRescan = vi.fn()) {
  render(
    <MemoryRouter>
      <CoursePage course={course} progress={progress} onRescan={onRescan} />
    </MemoryRouter>,
  );
  return { onRescan };
}

describe('CoursePage', () => {
  it('показує назву курсу', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Курс' })).toBeInTheDocument();
  });

  it('показує вкладені розділи', () => {
    renderPage();
    expect(screen.getByText('01 - Модуль перший')).toBeInTheDocument();
    expect(screen.getByText('1 - Розділ')).toBeInTheDocument();
  });

  it('показує уроки з посиланнями на плеєр', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Перше\.mp4/ })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v1',
    );
  });

  it('позначає переглянуті уроки', () => {
    renderPage({ v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 } });
    expect(screen.getByRole('link', { name: /Перше\.mp4/ })).toHaveTextContent('✓');
  });

  it('показує прогрес кожного розділу окремо', () => {
    renderPage({ v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 1 } });
    // Розділ: 100 з 200 с = 50%. Курс: 100 з 400 с = 25%.
    const bars = screen.getAllByRole('progressbar');
    const values = bars.map((b) => b.getAttribute('aria-valuenow'));
    expect(values).toContain('50');
    expect(values).toContain('25');
  });

  it('веде «продовжити» на перший урок нового курсу', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /почати курс/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v1',
    );
  });

  it('веде «продовжити» на незавершений урок', () => {
    renderPage({
      v1: { positionSec: 100, durationSec: 100, completed: true, updatedAt: 100 },
      v2: { positionSec: 30, durationSec: 100, completed: false, updatedAt: 500 },
    });
    expect(screen.getByRole('link', { name: /продовжити/i })).toHaveAttribute(
      'href',
      '/course/c1/lesson/v2',
    );
  });

  it('пропонує оновити структуру курсу', async () => {
    const { onRescan } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /оновити структуру/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('на курсі без відео не показує кнопку продовження', () => {
    const empty: Course = { ...course, tree: { ...course.tree, children: [] } };
    render(
      <MemoryRouter>
        <CoursePage course={empty} progress={{}} onRescan={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /продовжити|почати курс/i })).toBeNull();
    expect(screen.getByText(/не знайдено жодного відео/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/ui/CoursePage.test.tsx`
Expected: FAIL — `Failed to resolve import "./CoursePage"`.

- [ ] **Step 3: Реалізувати TreeSection**

`src/ui/TreeSection.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import { aggregate } from '../progress/aggregate';
import type { FolderNode, ProgressMap, TreeNode } from '../types';

export type TreeSectionProps = {
  node: FolderNode;
  courseId: string;
  progress: ProgressMap;
  depth?: number;
};

function LessonLink({
  node,
  courseId,
  progress,
}: {
  node: Extract<TreeNode, { kind: 'video' }>;
  courseId: string;
  progress: ProgressMap;
}) {
  const record = progress[node.id];
  const completed = record?.completed === true;
  const started = !completed && (record?.positionSec ?? 0) > 0;

  return (
    <Link
      to={`/course/${courseId}/lesson/${node.id}`}
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100"
    >
      <span
        aria-hidden
        className={completed ? 'text-emerald-600' : started ? 'text-amber-500' : 'text-zinc-300'}
      >
        {completed ? '✓' : started ? '◐' : '○'}
      </span>
      <span className={completed ? 'text-zinc-500' : ''}>{node.title}</span>
    </Link>
  );
}

/**
 * Рекурсивний акордеон: глибина дерева не обмежена, бо курси в Drive
 * бувають і на один рівень вкладеності, і на три.
 */
export function TreeSection({ node, courseId, progress, depth = 0 }: TreeSectionProps) {
  const stats = aggregate(node, progress);

  return (
    <details open={depth < 1} className="rounded-lg border border-zinc-200">
      <summary className="cursor-pointer select-none px-3 py-2">
        <span className="font-medium">{node.title}</span>
        <div className="mt-2">
          <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
        </div>
      </summary>

      <div className="flex flex-col gap-1 border-t border-zinc-100 p-2">
        {node.children.map((child) =>
          child.kind === 'folder' ? (
            <TreeSection
              key={child.id}
              node={child}
              courseId={courseId}
              progress={progress}
              depth={depth + 1}
            />
          ) : (
            <LessonLink key={child.id} node={child} courseId={courseId} progress={progress} />
          ),
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 4: Реалізувати CoursePage**

`src/ui/CoursePage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import { TreeSection } from './TreeSection';
import { aggregate, findResumeVideoId } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type CoursePageProps = {
  course: Course;
  progress: ProgressMap;
  onRescan(): void;
};

export function CoursePage({ course, progress, onRescan }: CoursePageProps) {
  const stats = aggregate(course.tree, progress);
  const resumeId = findResumeVideoId(course, progress);
  const started = stats.completedCount > 0 || stats.ratio > 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <Link to="/" className="text-sm text-zinc-500 hover:underline">
        ← Усі курси
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-zinc-500">
          {stats.completedCount} з {stats.videoCount} уроків
        </p>
        <ProgressBar ratio={stats.ratio} approximate={stats.approximate} />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {resumeId && (
          <Link
            to={`/course/${course.id}/lesson/${resumeId}`}
            className="rounded bg-zinc-900 px-4 py-2 text-white"
          >
            {started ? 'Продовжити' : 'Почати курс'}
          </Link>
        )}
        <button
          type="button"
          onClick={onRescan}
          className="rounded border border-zinc-300 px-4 py-2 text-sm"
        >
          Оновити структуру
        </button>
      </div>

      {course.tree.children.length === 0 ? (
        <p className="text-zinc-500">
          У цій папці не знайдено жодного відео. Перевірте, що доступ до папки відкритий і що
          вона містить відеофайли.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {course.tree.children.map((child) =>
            child.kind === 'folder' ? (
              <TreeSection
                key={child.id}
                node={child}
                courseId={course.id}
                progress={progress}
              />
            ) : (
              <TreeSection
                key={child.id}
                node={{
                  // Префікс, щоб синтетична папка не мала того самого id, що й відео в ній.
                  id: `section-${child.id}`,
                  kind: 'folder',
                  title: 'Без розділу',
                  children: [child],
                }}
                courseId={course.id}
                progress={progress}
              />
            ),
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/ui/CoursePage.test.tsx`
Expected: PASS, 9 тестів.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: сторінка курсу з рекурсивним деревом розділів

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Сторінка уроку, маршрутизація і вхід

**Files:**
- Create: `src/ui/LessonPage.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/ui/LessonPage.test.tsx`

**Interfaces:**
- Consumes: `VideoPlayer`, `FallbackPlayer`, `useMediaCapability`, `flattenVideos`, типи `Course`, `ProgressMap`.
- Produces:
  - `LessonPage({ course, progress, videoId, onPosition, onToggleCompleted }: { course: Course; progress: ProgressMap; videoId: string; onPosition(fileId: string, positionSec: number, durationSec: number | null): void; onToggleCompleted(fileId: string, completed: boolean): void })`
  - `App` із маршрутами `/`, `/course/:courseId`, `/course/:courseId/lesson/:videoId`

- [ ] **Step 1: Написати падаючі тести**

`src/ui/LessonPage.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Запустити тести і переконатися, що вони падають**

Run: `npm test -- src/ui/LessonPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./LessonPage"`.

- [ ] **Step 3: Реалізувати LessonPage**

`src/ui/LessonPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { FallbackPlayer } from '../player/FallbackPlayer';
import { VideoPlayer } from '../player/VideoPlayer';
import { useMediaCapability } from '../player/useMediaCapability';
import { flattenVideos } from '../progress/aggregate';
import type { Course, ProgressMap } from '../types';

export type LessonPageProps = {
  course: Course;
  progress: ProgressMap;
  videoId: string;
  onPosition(fileId: string, positionSec: number, durationSec: number | null): void;
  onToggleCompleted(fileId: string, completed: boolean): void;
};

export function LessonPage({
  course,
  progress,
  videoId,
  onPosition,
  onToggleCompleted,
}: LessonPageProps) {
  const { capability, markProxyUnsupported } = useMediaCapability();

  const videos = flattenVideos(course.tree);
  const index = videos.findIndex((v) => v.id === videoId);
  const video = index === -1 ? undefined : videos[index];

  if (!video) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <Link to={`/course/${course.id}`} className="text-sm text-zinc-500 hover:underline">
          ← До курсу
        </Link>
        <p className="mt-4 text-zinc-500">
          Урок не знайдено. Можливо, файл прибрали з Drive — спробуйте оновити структуру курсу.
        </p>
      </main>
    );
  }

  const record = progress[videoId];
  const completed = record?.completed === true;
  const previous = index > 0 ? videos[index - 1] : undefined;
  const next = index < videos.length - 1 ? videos[index + 1] : undefined;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link to={`/course/${course.id}`} className="text-sm text-zinc-500 hover:underline">
        ← {course.title}
      </Link>

      <h1 className="text-xl font-semibold">{video.title}</h1>

      {capability === 'proxy' ? (
        <>
          <VideoPlayer
            key={videoId}
            fileId={videoId}
            initialPositionSec={record?.positionSec ?? 0}
            onProgress={(positionSec, durationSec) =>
              onPosition(videoId, positionSec, durationSec)
            }
            onCompleted={() => onToggleCompleted(videoId, true)}
            onEnded={() => {}}
            onUnsupported={markProxyUnsupported}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={completed}
              onChange={() => onToggleCompleted(videoId, !completed)}
              className="h-4 w-4"
            />
            Переглянуто
          </label>
        </>
      ) : (
        <FallbackPlayer
          key={videoId}
          fileId={videoId}
          completed={completed}
          onToggleCompleted={() => onToggleCompleted(videoId, !completed)}
        />
      )}

      <nav className="flex justify-between gap-4 pt-2">
        {previous ? (
          <Link
            to={`/course/${course.id}/lesson/${previous.id}`}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            ← Попередній
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/course/${course.id}/lesson/${next.id}`}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            Наступний →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
```

- [ ] **Step 4: Запустити тести і переконатися, що вони проходять**

Run: `npm test -- src/ui/LessonPage.test.tsx`
Expected: PASS, 10 тестів.

- [ ] **Step 5: Зшити застосунок**

`src/App.tsx` — замінити повністю:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { CoursePage } from './ui/CoursePage';
import { LessonPage } from './ui/LessonPage';
import { LibraryPage } from './ui/LibraryPage';
import { createServices } from './app/services';
import { createLearnerStore } from './store/useStore';
import type { TokenClient } from './auth/tokenClient';
import type { LearnerState } from './store/useStore';
import type { StoreApi, UseBoundStore } from 'zustand';

type Store = UseBoundStore<StoreApi<LearnerState>>;

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [tokenClient, setTokenClient] = useState<TokenClient | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createServices()
      .then(({ tokenClient: client, ...deps }) => {
        if (cancelled) return;
        setTokenClient(client);
        setStore(createLearnerStore(deps));
        client.onChange(setSignedIn);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setFatal(cause instanceof Error ? cause.message : 'Помилка запуску');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (fatal) {
    return <main className="mx-auto max-w-xl p-8 text-red-700">{fatal}</main>;
  }

  if (!store || !tokenClient) {
    return <main className="mx-auto max-w-xl p-8 text-zinc-500">Завантаження…</main>;
  }

  if (!signedIn) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
        <h1 className="text-2xl font-semibold">Learner</h1>
        <p className="text-zinc-600">
          Увійдіть через Google, щоб застосунок міг читати папки курсів і зберігати ваш прогрес.
        </p>
        <button
          type="button"
          onClick={() => void tokenClient.signIn()}
          className="rounded bg-zinc-900 px-4 py-2 text-white"
        >
          Увійти через Google
        </button>
      </main>
    );
  }

  return <SignedInApp store={store} />;
}

function SignedInApp({ store }: { store: Store }) {
  const state = store();

  // init читає сховище й зливає прогрес — рівно один раз за монтування.
  // Порожній список залежностей тут навмисний: state змінюється на кожну дію,
  // і будь-яка залежність від нього перезапускала б init без кінця.
  useEffect(() => {
    void state.init();
  }, []);

  if (!state.ready) {
    return <main className="mx-auto max-w-xl p-8 text-zinc-500">Завантаження курсів…</main>;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LibraryPage
            courses={state.courses}
            progress={state.progress}
            onAddCourse={async (input) => {
              await state.addCourse(input);
            }}
            onRemoveCourse={(id) => void state.removeCourse(id)}
          />
        }
      />
      <Route path="/course/:courseId" element={<CourseRoute state={state} />} />
      <Route path="/course/:courseId/lesson/:videoId" element={<LessonRoute state={state} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function CourseRoute({ state }: { state: LearnerState }) {
  const { courseId } = useParams();
  const course = useMemo(
    () => state.courses.find((c) => c.id === courseId),
    [state.courses, courseId],
  );
  if (!course) return <Navigate to="/" replace />;

  return (
    <CoursePage
      course={course}
      progress={state.progress}
      onRescan={() => void state.rescanCourse(course.id)}
    />
  );
}

function LessonRoute({ state }: { state: LearnerState }) {
  const { courseId, videoId } = useParams();
  const course = state.courses.find((c) => c.id === courseId);
  if (!course || !videoId) return <Navigate to="/" replace />;

  return (
    <LessonPage
      course={course}
      progress={state.progress}
      videoId={videoId}
      onPosition={(fileId, positionSec, durationSec) =>
        void state.setPosition(fileId, positionSec, durationSec)
      }
      onToggleCompleted={(fileId, completed) => void state.setCompleted(fileId, completed)}
    />
  );
}
```

`src/main.tsx` — обгорнути в роутер:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Прогнати всі тести і збірку**

Run: `npm test && npm run build`
Expected: усі тести зелені, збірка без помилок.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: сторінка уроку, маршрутизація і екран входу

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Приймальна перевірка на реальному курсі

Автотести не покривають відтворення відео й синхронізацію між справжніми пристроями. Ця задача — перевірка вручну проти критеріїв готовності зі спеки. Кожен пункт або проходить, або стає задачею на виправлення.

**Files:**
- Create: `README.md`
- Create: `docs/superpowers/plans/2026-09-20-acceptance.md`

**Interfaces:**
- Consumes: усе попереднє.
- Produces: заповнений чек-лист приймання і README з інструкцією запуску.

- [ ] **Step 1: Написати README**

`README.md`:

```markdown
# Learner

PWA, що перетворює папку Google Drive у відеокурс із відстеженням прогресу.
Прогрес зберігається локально й синхронізується між пристроями через приховану
папку застосунку у Drive самого користувача. Бекенду немає.

## Запуск

1. Налаштувати Google Cloud за `docs/google-cloud-setup.md`
2. `cp .env.example .env.local` і вписати `VITE_GOOGLE_CLIENT_ID`
3. `npm install`
4. `npm run dev`

## Команди

| Команда | Що робить |
|---|---|
| `npm run dev` | дев-сервер |
| `npm test` | усі тести |
| `npm run build` | типізація + продакшн-збірка |

## Документи

- Дизайн: `docs/superpowers/specs/2026-09-20-drive-course-player-design.md`
- План реалізації: `docs/superpowers/plans/2026-09-20-drive-course-player.md`
- Результат спайка про Service Worker: `docs/superpowers/plans/2026-09-20-spike-result.md`
```

- [ ] **Step 2: Перевірити критерій 1 — структура курсу**

Запустити `npm run dev`, увійти, додати
`https://drive.google.com/drive/folders/1xMYDlMRkhsf2ggCjxQ6ZtSL7qtRb0lwk`.

Expected: чотири модулі в порядку `01`…`04`, вкладені підрозділи в порядку `1`, `2`, `3`, у листках mp4-файли, жодного `.DS_Store`.

- [ ] **Step 3: Перевірити критерій 2 — відновлення позиції**

Відкрити урок, подивитися ~30 с, вийти на сторінку курсу, повернутися в той самий урок.

Expected: відео починається приблизно з тієї секунди, де його залишили.

- [ ] **Step 4: Перевірити критерій 3 — прогрес за часом**

Додивитися один короткий урок до кінця.

Expected: урок позначений ✓; відсоток розділу й курсу зріс пропорційно **тривалості** цього уроку, а не як «один з N».

- [ ] **Step 5: Перевірити критерії 4 і 5 — синхронізація між пристроями**

Подивитися урок у Chrome на десктопі, дочекатися ~15 с (дебоунс синхронізації), відкрити застосунок на телефоні тим самим акаунтом.

Expected: прогрес із десктопа видно на телефоні.

Потім: на телефоні просунути урок A, на десктопі — урок B, обидва перезавантажити.

Expected: обидва просування збереглися; жодне не затерло інше.

- [ ] **Step 6: Перевірити критерій 6 — автоматичний відкіт**

У DevTools → Application → Service Workers натиснути Unregister, перезавантажити сторінку й відкрити урок.

Expected: показано iframe Drive і ручний чекбокс «переглянуто» з поясненням.

- [ ] **Step 7: Перевірити офлайн**

У DevTools увімкнути Offline і перезавантажити застосунок.

Expected: бібліотека й дерево курсу відкриваються з кешу, прогрес видно; відео, звісно, не грає.

- [ ] **Step 8: Перевірити критерій 7 — тести**

Run: `npm test && npm run build`
Expected: усі тести зелені, збірка чиста.

- [ ] **Step 9: Записати результати приймання**

`docs/superpowers/plans/2026-09-20-acceptance.md` — таблиця з семи критеріїв зі спеки, по кожному `пройдено / ні` і, якщо ні, що саме пішло не так.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "docs: README і результати приймальної перевірки

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
