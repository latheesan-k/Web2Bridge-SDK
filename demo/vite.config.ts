import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.DEMO_BASE_PATH || '/',
  plugins: [
    react(), 
    wasm(),
    nodePolyfills({
      include: ['crypto', 'stream', 'events', 'fs', 'path', 'util', 'buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
    })
  ],
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: (5 * 1024),
    rollupOptions: {
      external: ['argon2-browser'],
      output: {
        globals: {
          'argon2-browser': 'argon2'
        },
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-clerk': ['@clerk/clerk-react'],
          'vendor-mesh': ['@meshsdk/core'],
        }
      }
    }
  },
  optimizeDeps: {
    include: ['@meshsdk/core'],
    exclude: ['argon2-browser']
  }
})
