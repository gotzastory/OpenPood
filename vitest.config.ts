import { defineConfig } from 'vitest/config';

// Standalone vitest config so tests do NOT load vite.config.ts — its
// vite-plugin-electron setup would try to spawn Electron during a test run.
export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
