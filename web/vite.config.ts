import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Stamped into the bundle at build time — visible in browser console as:
//   [TenPOS] build 2026-05-25T14:30:00.000Z
const BUILD_TIME = new Date().toISOString()

export default defineConfig({
  plugins: [react()],

  define: {
    // Replaced at compile-time so there's no runtime overhead
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },

  resolve: {
    alias: {
      '@tenpos/shared': path.resolve(__dirname, '../shared/src'),
    },
  },

  build: {
    // Target modern browsers only — smaller output, faster parse
    target: 'es2020',

    // Raise the warning threshold — we know recharts is large
    chunkSizeWarningLimit: 600,

    // Use Vite 8's default OXC minifier (faster than esbuild/terser)
    // console.log calls are tiny — stripping them isn't worth the complexity in Vite 8

    rollupOptions: {
      output: {
        /**
         * Manual chunk splitting strategy:
         *
         *  chunk-react   — React core + router (cached aggressively, rarely changes)
         *  chunk-charts  — Recharts + D3 internals (large, only loaded on report pages)
         *  chunk-icons   — Lucide React icon set
         *  chunk-state   — Zustand
         *  chunk-vendor  — everything else from node_modules
         *
         * Pages get their own chunks automatically via React.lazy().
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return

          // Recharts + D3 sub-packages — only used on report pages
          if (
            id.includes('recharts') ||
            id.includes('d3-') ||
            id.includes('victory-') ||
            id.includes('internmap') ||
            id.includes('delaunator') ||
            id.includes('robust-predicates')
          ) return 'chunk-charts'

          // React core + router
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) return 'chunk-react'

          // Lucide icons — tree-shaken but still a big registry
          if (id.includes('lucide-react')) return 'chunk-icons'

          // Zustand + shared package
          if (id.includes('zustand') || id.includes('@tenpos')) return 'chunk-state'

          // Everything else in node_modules
          return 'chunk-vendor'
        },
      },
    },
  },

  // Dev server config — faster HMR
  server: {
    hmr: { overlay: true },
  },
})
