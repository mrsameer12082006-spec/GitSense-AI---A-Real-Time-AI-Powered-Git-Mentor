import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5005',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, _res) => {
            // Silence raw ECONNREFUSED/ECONNRESET stack traces and show a clean message
            console.warn(`\n⚠️  [Vite Proxy] Failed to connect to backend: ${err.message} (Is the backend running on port 5005?)\n`);
          });
        }
      },
    },
  },
})
