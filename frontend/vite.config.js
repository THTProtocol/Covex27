import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('poseidon-lite') || id.includes('snarkjs') || id.includes('circomlib')) return 'vendor-zk';
            if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
            if (id.includes('chess.js') || id.includes('react-chessboard')) return 'vendor-chess';
            if (id.includes('kaspa-wasm') || id.includes('@onekeyfe')) return 'vendor-kaspa-wasm';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3006',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
