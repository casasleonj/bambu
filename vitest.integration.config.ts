// Config dedicado para tests de integración con DB real.
// A diferencia del vitest.config.ts principal, acá:
//   - Forzamos un solo worker (singleFork) para que los resetAndSeed
//     no se pisen entre archivos.
//   - El environment sigue siendo jsdom (no necesitamos DOM, pero la
//     config principal lo usa y algunos imports lo esperan).
//   - Solo ejecuta archivos bajo src/lib/__tests__/integration/**.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/lib/__tests__/integration/**/*.test.ts'],
    exclude: ['node_modules/**', '.opencode/**', 'e2e/**', '.next/**'],
    // CRÍTICO: un solo worker. resetAndSeed() borra+siembra la DB y
    // archivos concurrentes se pisarían. Los tests internos pueden
    // ser paralelos (Promise.all) pero los archivos van en serie.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 60000, // las llamadas a execSync (clean/seed) pueden tardar
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
