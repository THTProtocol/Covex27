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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Dedup the kaspa-wasm double-ship: the package's kaspa_bg.wasm.js glue embeds the entire
      // ~11.5MB wasm AGAIN as base64 (only reachable via default()/__wbg_init, a CJS require that
      // already fails in the browser and is never used by our initSync path). The require is a
      // RELATIVE "./kaspa_bg.wasm.js" inside the package, so it is matched here by its resolved
      // absolute path (a regex on the file name). Aliasing it to an empty stub strips that
      // duplicate from the vendor-kaspa-wasm chunk; the binary still ships exactly once as the
      // served kaspa_bg.wasm.bin asset that loadKaspaWasm() fetches + compiles. The regex matches
      // the WHOLE specifier (relative "./kaspa_bg.wasm.js" or any absolute path ending in it) and
      // replaces it wholesale with the stub.
      { find: /^.*[\\/]kaspa_bg\.wasm\.js$/, replacement: path.resolve(__dirname, './src/lib/kaspaWasmGlueStub.js') },
    ],
  },
})
