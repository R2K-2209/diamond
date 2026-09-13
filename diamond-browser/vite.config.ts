import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'electron/main.ts',
      },
      {
        // Main window preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      },
      {
        // Webview preload script (Layer 4: DOM Content Scanner)
        entry: 'electron/webviewPreload.ts',
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
});
