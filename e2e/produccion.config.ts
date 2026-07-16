import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './produccion',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 600000,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://portal.aguabambu.com',
    trace: 'on',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
})
