import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 8801,
    allowedHosts: ['.trycloudflare.com'],
    // Lets the dev server be exposed through a single tunnel: run with
    // VITE_API_URL=/api/v1 and the backend is reached same-origin.
    proxy: {
      // The backend CORS list only knows localhost origins; present the
      // proxied request as coming from the dev server itself.
      '/api': { target: 'http://localhost:8800', headers: { Origin: 'http://localhost:8801' } },
      '/uploads': 'http://localhost:8800',
      '/swagger': 'http://localhost:8800',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})
