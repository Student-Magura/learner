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
