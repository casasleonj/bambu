import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [
      'node_modules/**',
      '.opencode/**',
      'e2e/**',
      '.next/**',
      '.worktrees/**',
      // Integration tests con DB real corren con su propio config
      // (vitest.integration.config.ts + singleFork). Excluidos acá
      // para que NO corran en paralelo durante la suite normal.
      'src/lib/__tests__/integration/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: './reports/coverage',
      include: [
        'src/lib/**/*.ts',
        'src/shared/**/*.ts',
        'src/modules/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/test/**',
        'src/lib/db/**',
        'src/lib/prisma.ts',
        'src/lib/supabase.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
