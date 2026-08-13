import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 8080, host: true },
  build: {
    rollupOptions: {
      output: {
        // Tres pedacos em vez de um so. O ganho nao e o total, que continua o
        // mesmo: e que React e Supabase quase nunca mudam, entao o navegador
        // guarda esses dois em cache e cada deploy so baixa o codigo do app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ roda no Playwright, com navegador de verdade. Sem esta exclusao o
    // Vitest tenta executar aqueles specs e falha ao importar @playwright/test.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
})
