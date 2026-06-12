import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 4,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },

  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    // Reusar server existente solo cuando se corre en localhost.
    // Para LAN, Playwright SIEMPRE arranca un webServer nuevo (el server
    // ya debe estar corriendo manualmente en la IP LAN esperada).
    reuseExistingServer: !process.env.PLAYWRIGHT_TEST_BASE_URL,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Project mobile: iPhone 13 viewport (390x844) con touch + isMobile.
    // Usado por los specs e2e/mobile-*.spec.ts para validar regresiones
    // mobile (overflow horizontal, drawer, detalle de clientes).
    // Los specs usan `test.use` al top-level para override explicito del
    // viewport; este project provee el default y permite correrlos con:
    //   npx playwright test e2e/mobile-*.spec.ts --project=chromium-mobile
    { name: 'chromium-mobile', use: { ...devices['iPhone 13'] } },
  ],
})
