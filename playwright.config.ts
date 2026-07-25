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
  // Workers reduced to 1 while Auth.js credential sign-in via Server Action
  // shows concurrency issues in dev mode (intermittent CredentialsSignin / 403).
  // See discussion: e2e clientes.spec.ts passes 61/61 with workers=1.
  workers: 1,
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
