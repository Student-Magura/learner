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
