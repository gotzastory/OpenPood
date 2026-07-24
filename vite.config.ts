import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset URLs so public/ icons work under Electron's file:// protocol.
  base: './',
  plugins: [
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron-store'] },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      renderer: {},
    }),
  ],
});
