import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_URL = process.env.MULTIGO_SERVER_URL ?? 'http://127.0.0.1:4870';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4871,
    strictPort: true,
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4871 },
});
