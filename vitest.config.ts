import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { Plugin } from 'vite'

/**
 * Vite plugin that resolves bare Next.js subpath imports (e.g. `next/server`,
 * `next/headers`) to their `.js` counterparts, but ONLY when requested by
 * `next-auth` internals. Next.js 16 ships these entry points as files but does
 * not expose an `exports` map, so Vitest/Node ESM resolution fails on the
 * extensionless specifier. Limiting the rewrite to `next-auth` preserves
 * existing `vi.mock('next/...')` calls in test files.
 */
function nextSubpathResolver(): Plugin {
  return {
    name: 'next-subpath-resolver',
    enforce: 'pre',
    resolveId(id, importer) {
      if (
        importer?.includes('node_modules/next-auth/') &&
        id.startsWith('next/') &&
        !id.endsWith('.js')
      ) {
        return { id: id + '.js', external: true }
      }
    },
  }
}

export default defineConfig({
  plugins: [nextSubpathResolver(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // NOTE: `deps.inline` is deprecated in Vitest v3, but `server.deps.inline`
    // does not inline `next-auth` sufficiently for our custom resolver plugin
    // to intercept its `next/server` import. Keep this until Vitest provides a
    // working replacement for this use case.
    deps: {
      inline: ['next-auth'],
    },
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
  server: {
    deps: {
      // next-auth v5 beta importa 'next/server' sin extensión .js,
      // lo cual falla en la resolución ESM de Vitest/Vite.
      // Forzamos a inlinearlo para que use la resolución de Node.
      inline: ['next-auth'],
    },
  },
})
