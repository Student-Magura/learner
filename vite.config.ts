// defineConfig саме з 'vitest/config': варіант із 'vite' не знає про ключ `test`,
// а tsconfig перевіряє цей файл, тому `npm run build` падав би на типах.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site: served at https://<account>.github.io/learner/.
const BASE = '/learner/';

export default defineConfig({
  base: BASE,
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
        start_url: BASE,
        scope: BASE,
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
    // Vitest's default `toFake` list, minus `setImmediate`/`clearImmediate` and
    // `queueMicrotask`: fake-indexeddb schedules its callbacks through
    // `setImmediate`/`clearImmediate`, and faking them would hang any test that
    // awaits an IndexedDB operation while timers are faked (syncEngine.test.ts).
    // `queueMicrotask` is excluded by Vitest's own defaults too: code that calls
    // the global `queueMicrotask()` directly — including parts of React's
    // scheduler — can hang if it's queued onto a fake clock nothing advances.
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
      ],
    },
  },
});
