import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API and the sockets are proxied to the server on :5001 (override with VITE_PROXY_TARGET).
// In production the server serves client/dist itself, so everything is same-origin.
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:5001'; // the server's PORT

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
