import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Capacitor requires relative asset paths inside Android assets/
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@tenpos/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    // Target Android 7+ (Chrome 58 WebView) — broad compatibility
    target: 'es2015',
    // Suppress warnings below 700 kB (vendor chunks can be large; app chunks are small)
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split vendor libs so the initial entry chunk is tiny.
        // On Android APK all chunks are local files — no extra network cost.
        manualChunks(id) {
          if (!id.includes('node_modules')) return   // app code → per-route via lazy()

          // Charts only load when reports are opened
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('d3/'))
            return 'vendor-charts'

          // Supabase client
          if (id.includes('@supabase'))
            return 'vendor-supabase'

          // Dexie offline DB
          if (id.includes('dexie'))
            return 'vendor-db'

          // Lucide icons (large — split so they load with the page that needs them)
          if (id.includes('lucide-react'))
            return 'vendor-icons'

          // Capacitor plugins
          if (id.includes('@capacitor'))
            return 'vendor-capacitor'

          // React + router + scheduler — always needed, keep together
          return 'vendor-react'
        },
      },
    },
  },
})
