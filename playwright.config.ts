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
  // The login-race itself is fixed by authenticating once per (worker,
  // role) and caching the session — see AGENTS.md Known Issue #20.
  // REVERTED to 1 in CI (ago 2026): a real 2-worker CI run still showed
  // recurring CredentialsSignin errors and an elevated flaky-test count
  // on the exact same shards that ran clean at workers:1 — consistent
  // with the residual, still-unfixed risk documented in AGENTS.md #20:
  // resetDatabase()/resetTestDatabase() truncates SesionActiva (session
  // table), and a completed reset from ANY worker can 401 another
  // worker's already-authenticated page (sharedPageLogin pattern). The
  // advisory lock in prisma/reset-locked.ts only serializes concurrent
  // resets against each other; it does not stop that cross-worker
  // invalidation. Real DB-per-worker isolation (AGENTS.md #20) is the
  // prerequisite for safely raising this again — not attempted here.
  // PW_WORKERS wins when set (manual override, e.g. to re-trial 2+ in CI
  // via workflow_dispatch once the DB-per-worker fix lands).
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : (process.env.CI ? 1 : 1),
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
    // FIX: page.request.*() (el APIRequestContext de Node usado por los
    // helpers apiPost/apiPut/apiPatch/apiDelete de fixtures.ts, y por
    // decenas de specs que llaman page.request.post/put/delete
    // directamente) NO setea Origin/Referer como un fetch() real del
    // browser -- es una limitación conocida de Playwright, no un gap de
    // seguridad real (la UI real de la app siempre usa fetch() del browser,
    // que sí estampa Origin correctamente). src/lib/csrf.ts's validateCsrf()
    // sólo corre cuando NODE_ENV !== 'development' (nunca bajo `next dev`,
    // que enmascaró esto en todos los runs de E2E hasta ahora) y rechaza
    // con 403 cualquier POST/PUT/DELETE/PATCH sin Origin/Referer válido.
    // extraHTTPHeaders se aplica a nivel de browser context, incluyendo
    // page.request (confirmado: mismo Origin real que ya tendría cualquier
    // fetch() same-origin del browser en este setup, no afecta nada más).
    extraHTTPHeaders: {
      origin: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001',
    },
  },

  webServer: {
    // En CI corremos contra el build de producción (`next build` + el
    // server standalone ya armado por un step previo del workflow), no
    // contra `next dev`. Next.js recomienda esto explícitamente para E2E
    // (node_modules/next/dist/docs/.../testing/playwright.md) y coincide
    // con el diagnóstico de AGENTS.md Known Issue #25: `next dev` sostenido
    // por 20-40min por shard bajo carga real de browser (workers:1, cientos
    // de tests seriales) degradaba progresivamente, dejando cada vez más
    // tests con timeouts amplios/sin relación entre sí y una cola creciente
    // de "N did not run". `next start` no sirve acá porque next.config.ts
    // usa `output: 'standalone'` (next start lo rechaza explícitamente) —
    // se usa el server.js standalone en su lugar. Local dev sigue en
    // `npm run dev` sin cambios.
    command: process.env.CI ? 'node .next/standalone/server.js' : 'npm run dev',
    url: process.env.PLAYWRIGHT_TEST_BASE_URL
      ? `${process.env.PLAYWRIGHT_TEST_BASE_URL}/api/health`
      : 'http://localhost:3001/api/health',
    // Reusar server existente solo cuando se corre en localhost.
    // Para LAN, Playwright SIEMPRE arranca un webServer nuevo (el server
    // ya debe estar corriendo manualmente en la IP LAN esperada).
    reuseExistingServer: true,
    timeout: 120000,
    // FIX (investigación de capacidad de CI, continuación de Known Issue
    // #25): por defecto Playwright ignora el stdout del webServer
    // (node_modules/playwright/types/test.d.ts: `stdout` default "ignore",
    // solo `stderr` se pipea). Pino (src/lib/logger.ts) escribe a stdout
    // por defecto (node_modules/pino/docs/api.md:628), así que cualquier
    // logger.error()/logger.warn() de la app durante el run quedaba
    // completamente invisible en el log de CI. Sin esto no hay forma de
    // diagnosticar los 500 reales detrás de failures como el TypeError de
    // createTrabajador() en deudas.spec.ts. Solo en CI (local ya se ve en
    // la terminal de `npm run dev`, pipearlo ahí sería ruido redundante).
    stdout: process.env.CI ? 'pipe' : 'ignore',
    env: {
      PORT: '3001',
      // Relajar el límite de conexiones SSE en tests E2E para que múltiples
      // pestañas / reconexiones del RealtimeProvider no provoquen rate-limit
      // durante las pruebas de entrega de eventos (M6).
      REALTIME_RATE_LIMIT_POINTS: '100',
      // Relajar el límite de /api/* en tests E2E. checkRateLimit(ip, 'api')
      // (src/proxy.ts) usa la IP del request como key -- en CI/local E2E
      // TODOS los tests de un shard comparten esa única IP (127.0.0.1),
      // así que el balde de 300/60s pensado para una IP real de producción
      // se agota con el volumen agregado de cientos de tests seriales sin
      // relación con abuso real. Confirmado en CI de PR #127: tests de
      // roles-permisos.spec.ts que esperaban 403 recibían 429 por este
      // motivo. El default de producción (300/60s) no cambia -- ver
      // src/lib/rate-limit.ts.
      API_RATE_LIMIT_POINTS: '3000',
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
