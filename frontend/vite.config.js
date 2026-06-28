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
        // Rolldown's rollup-compat `manualChunks(id)` is only advisory: rolldown runs its own
        // splitter on top and was MERGING React core (react / jsx-runtime / scheduler) together with
        // chess.js into one 118KB chunk that the entry modulepreloaded on EVERY page (chess is only
        // used on the chess route). The native `advancedChunks.groups` API is priority-deterministic
        // ("modules captured by a higher-priority group are removed from lower-priority groups"), so a
        // top-priority React group pins React core to vendor-react and the lower-priority chess group
        // keeps chess.js / react-chessboard OUT of the entry preload graph.
        //
        // lucide-react intentionally gets NO group: a blanket lucide chunk forces the whole package
        // into one file and defeats tree-shaking. Letting it fall through lets the bundler keep only
        // what is reachable. (The icon-picker in src/lib/puckConfig.jsx / puckFields.jsx still does a
        // `import * as Lucide` namespace import, which keeps the full set alive there; that file is
        // owned by another lane. Once that namespace import moves to a lazy boundary, this config
        // already lets lucide tree-shake.)
        advancedChunks: {
          groups: [
            // React core: highest priority so jsx-runtime / scheduler never leak into chess.
            {
              name: 'vendor-react',
              priority: 100,
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
            },
            { name: 'vendor-zk', priority: 50, test: /[\\/]node_modules[\\/](poseidon-lite|snarkjs|circomlib)[\\/]/ },
            { name: 'vendor-kaspa-wasm', priority: 50, test: /[\\/]node_modules[\\/](@onekeyfe[\\/])?kaspa-wasm/ },
            { name: 'vendor-motion', priority: 50, test: /[\\/]node_modules[\\/]framer-motion[\\/]/ },
            // Chess LAST and lowest priority: React core has already been claimed by vendor-react,
            // so only the actual chess.js / react-chessboard code lands here (off the entry graph).
            { name: 'vendor-chess', priority: 10, test: /[\\/]node_modules[\\/](chess\.js|react-chessboard)[\\/]/ },
          ],
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
