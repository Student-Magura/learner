/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { contentRangeFor } from './contentRange';
import { createTokenSource } from './tokenSource';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Оболонка застосунку кешується, тому бібліотека курсів відкривається офлайн.
precacheAndRoute(self.__WB_MANIFEST);

// Виводимо префікс з власного розташування воркера, а не з літералу: воркер
// живе за адресою свого scope (наприклад /learner/service-worker.js під
// проєктним піддомовим шляхом), тож і медіа-маршрут мусить лежати всередині
// цього ж scope. Це має погоджуватись з mediaUrl() у
// src/player/useMediaCapability.ts — інакше запит піде повз воркер і мовчки
// провалиться 404-кою від статичного сервера.
const MEDIA_PREFIX = new URL('media/', self.location.href).pathname;

/** Заголовки, без яких медіа-елемент не вміє ні тривалість, ні перемотку. */
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'etag'];

/**
 * Скільки чекаємо на токен від сторінки. Невимушений getToken на сторінці
 * віддає кеш миттєво; довше триває лише тихе поновлення через GIS (мережевий
 * обмін із Google), якому на повільному мобільному звʼязку треба кілька секунд.
 * Довше не чекаємо: медіа-елемент весь цей час стоїть без відповіді.
 */
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

// Змінна в памʼяті воркера живе лише до його зупинки браузером, тож це кеш:
// порожній — питаємо сторінку (GET_TOKEN).
const tokens = createTokenSource({
  requestFromClient: requestTokenFromPage,
  timeoutMs: TOKEN_REQUEST_TIMEOUT_MS,
});

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; token?: string } | null;
  if (data?.type === 'SET_TOKEN' && typeof data.token === 'string') {
    tokens.set(data.token);
  }
  // Сторінка після жорсткого перезавантаження лишається без контролера, а
  // claim() з activate вже відпрацював. Плеєр просить взяти її явно.
  if (data?.type === 'CLAIM') {
    event.waitUntil(self.clients.claim());
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  // Чіпаємо ТІЛЬКИ власний медіа-маршрут: решту запитів не торкаємо.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(MEDIA_PREFIX)) return;

  event.respondWith(
    proxyMedia(event.request, url.pathname.slice(MEDIA_PREFIX.length), event.clientId),
  );
});

/** Сторінка, що зробила запит, або будь-яке інше вікно застосунку. */
async function findWindowClient(clientId: string): Promise<Client | undefined> {
  // clientId буває порожнім рядком для деяких типів запитів.
  if (clientId) {
    const client = await self.clients.get(clientId);
    if (client) return client;
  }
  const windows = await self.clients.matchAll({ type: 'window' });
  return windows[0];
}

/** GET_TOKEN через MessageChannel: відповідь приходить саме на цей запит. */
async function requestTokenFromPage(force: boolean, clientId: string): Promise<string | null> {
  const client = await findWindowClient(clientId);
  if (!client) return null;

  const channel = new MessageChannel();
  const reply = new Promise<string | null>((resolve) => {
    channel.port1.onmessage = (event: MessageEvent) => {
      channel.port1.close();
      const data = event.data as { token?: unknown } | null;
      resolve(typeof data?.token === 'string' ? data.token : null);
    };
  });
  client.postMessage({ type: 'GET_TOKEN', force }, [channel.port2]);
  return reply;
}

// Розмір файлу потрібен, щоб скласти Content-Range (див. contentRange.ts).
// Кешуємо на час життя воркера: після перезапуску один зайвий запит — дрібниця.
const fileSizes = new Map<string, number>();

async function fileSize(fileId: string, token: string): Promise<number | null> {
  const cached = fileSizes.get(fileId);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return null;
    const size = Number(((await response.json()) as { size?: string }).size);
    if (!Number.isFinite(size) || size <= 0) return null;
    fileSizes.set(fileId, size);
    return size;
  } catch {
    return null;
  }
}

function fetchFromDrive(fileId: string, token: string, range: string | null): Promise<Response> {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (range) headers.set('Range', range);
  return fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers },
  );
}

async function proxyMedia(request: Request, fileId: string, clientId: string): Promise<Response> {
  const token = await tokens.get(clientId);
  if (!token) {
    return new Response('Немає токена доступу', { status: 401 });
  }

  const range = request.headers.get('Range');
  let usedToken = token;
  let upstream = await fetchFromDrive(fileId, usedToken, range);

  // Протермінований або відкликаний токен: беремо свіжий і пробуємо рівно ще
  // раз. Повторний 401 віддаємо як є — це сигнал для запасного шляху плеєра.
  if (upstream.status === 401) {
    const renewed = await tokens.renew(token, clientId);
    if (renewed) {
      usedToken = renewed;
      upstream = await fetchFromDrive(fileId, usedToken, range);
    }
  }

  const out = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }

  // Drive не відкриває Content-Range у CORS — без нього медіа-движок відкидає
  // 206 як «Format error». Справжній заголовок, якщо колись стане видимим,
  // має пріоритет; інакше складаємо його самі.
  if (upstream.status === 206 && !out.has('content-range')) {
    const total = await fileSize(fileId, usedToken);
    const lengthHeader = upstream.headers.get('content-length');
    const chunkLength = lengthHeader === null ? null : Number(lengthHeader);
    const contentRange =
      total === null ? null : contentRangeFor(range, Number.isFinite(chunkLength) ? chunkLength : null, total);
    if (contentRange) out.set('content-range', contentRange);
  }
  // accept-ranges: bytes стверджує, що тіло — байти медіа, які можна перемотувати
  // Range-запитом. На помилковій відповіді (403/404 і т.п.) тіло — це JSON з
  // описом помилки, а не медіа, тож заголовок ставимо лише коли Drive справді
  // віддав медіа-байти: успіх (ok) або часткову відповідь (206).
  if (upstream.ok || upstream.status === 206) {
    out.set('accept-ranges', 'bytes');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
