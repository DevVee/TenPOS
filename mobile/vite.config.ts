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
})
