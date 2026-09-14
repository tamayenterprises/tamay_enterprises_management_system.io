import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
            return 'react'
          }
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'forms'
          }
          if (id.includes('@radix-ui')) return 'ui'
          if (id.includes('lucide-react') || id.includes('date-fns') || id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'utils'
          }
          return undefined
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
