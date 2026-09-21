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
    // Vitest's default `toFake` list, minus `setImmediate`/`clearImmediate`: fake-indexeddb
    // schedules its callbacks through those two, and faking them would hang any test that
    // awaits an IndexedDB operation while timers are faked (syncEngine.test.ts).
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
      ],
    },
  },
});
