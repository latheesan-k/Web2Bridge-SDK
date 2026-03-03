import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  base: env.DEMO_BASE_PATH || '/',
  plugins: [
    react(),
    wasm(),
    nodePolyfills({
      include: ['crypto', 'stream', 'events', 'fs', 'path', 'util', 'buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      protocolImports: true
    })
  ],
  server: {
    port: 3000,
    host: true,
    ...(env.VITE_HMR_HOST && {
      hmr: {
        host: env.VITE_HMR_HOST,
        protocol: env.VITE_HMR_PROTOCOL as 'ws' | 'wss' | undefined,
        clientPort: env.VITE_HMR_CLIENT_PORT ? parseInt(env.VITE_HMR_CLIENT_PORT, 10) : undefined
      }
    })
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: (5 * 1024),
    rollupOptions: {
      external: [
        'argon2-browser',
        /^vite-plugin-node-polyfills\/shims\//
      ],
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
}})
