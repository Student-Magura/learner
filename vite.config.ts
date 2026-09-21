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
    // fake-indexeddb schedules its callbacks via setImmediate; faking it too would
    // make every IndexedDB operation hang under vi.useFakeTimers() (syncEngine.test.ts).
    fakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] },
  },
});
