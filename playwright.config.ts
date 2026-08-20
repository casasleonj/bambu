import { defineConfig, devices } from '@playwright/test'

// Exponer el override al test runner para que specs que validan los límites
// default (ej. session-limits.spec.ts) puedan skippear o adaptarse.
if (!process.env.SESSION_LIMITS_JSON) {
  process.env.SESSION_LIMITS_JSON = JSON.stringify({
    ADMIN: 50,
    ASISTENTE: 50,
    CONTADOR: 50,
    REPARTIDOR: 50,
    SELLADOR: 50,
  })
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Was pinned to 1: hundreds of tests each doing a real UI/CSRF login hit
  // Auth.js's Credentials provider concurrently, producing intermittent
  // CredentialsSignin/403s (see e2e/fixtures.ts "Per-worker auth cache").
  // Fixed by authenticating once per (worker, role) and caching the session
  // — see AGENTS.md Known Issue #20 for the fix and its measured evidence.
  // Kept conservative at 2 (not higher): resetDatabase()/resetTestDatabase()
  // truncates SesionActiva, which invalidates every currently-active
  // session cluster-wide, not just the resetting test's own data. A
  // Postgres advisory lock (prisma/reset-locked.ts) prevents two resets
  // from corrupting each other, but does not stop a completed reset from
  // 401ing another worker's already-authenticated page — that residual
  // risk grows with worker count, so 2 was chosen over 4/8 pending the
  // fuller fix (DB-per-worker isolation, still open — see AGENTS.md #20).
  // PW_WORKERS wins when set (manual override, e.g. to trial 4 in CI via
  // workflow_dispatch); otherwise CI runs 2, local dev stays at 1.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : (process.env.CI ? 2 : 1),
  reporter: 'html',
  // Specs exploratorios y QA comprehensivo son scripts manuales/auditores
  // que registran hallazgos, no tests CI. Los excluimos de la ejecución
  // por defecto para evitar timeouts y falsos negativos.
  testIgnore: ['**/exploratory/**', '**/qa-comprehensive/**', '**/produccion/**'],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },

  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_TEST_BASE_URL
      ? `${process.env.PLAYWRIGHT_TEST_BASE_URL}/api/health`
      : 'http://localhost:3001/api/health',
    // Reusar server existente solo cuando se corre en localhost.
    // Para LAN, Playwright SIEMPRE arranca un webServer nuevo (el server
    // ya debe estar corriendo manualmente en la IP LAN esperada).
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      PORT: '3001',
      // Relajar el límite de conexiones SSE en tests E2E para que múltiples
      // pestañas / reconexiones del RealtimeProvider no provoquen rate-limit
      // durante las pruebas de entrega de eventos (M6).
      REALTIME_RATE_LIMIT_POINTS: '100',
      // Relajar el límite de sesiones activas en tests E2E. Playwright corre
      // múltiples workers y varios tests requieren login con el mismo rol en
      // paralelo; sin este override los logins concurrentes se evitan mutuamente
      // por el LRU de SesionActiva (sobre todo ADMIN=2 y CONTADOR=1).
      SESSION_LIMITS_JSON: JSON.stringify({
        ADMIN: 50,
        ASISTENTE: 50,
        CONTADOR: 50,
        REPARTIDOR: 50,
        SELLADOR: 50,
      }),
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Project mobile: iPhone 13 viewport (390x844) con touch + isMobile.
    // Usamos chromium con config mobile (no WebKit, que requiere
    // binarios adicionales que no están en este entorno).
    // Los specs que quieran mobile pueden usar `test.use({...})` al
    // top-level o correr con --project=chromium-mobile.
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
      },
    },
  ],
})
