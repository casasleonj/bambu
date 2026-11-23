import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Real policy needs an isolated server: the general suite allows 50 sessions
// to keep its unrelated role fixtures from evicting each other.
process.env.SESSION_LIMITS_JSON = '{}'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer

export default defineConfig({
  ...base,
  testMatch: '**/session-limits.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results-sessions',
  reporter: [['html', { outputFolder: 'playwright-report-sessions', open: 'never' }]],
  webServer: {
    ...server,
    command: process.env.CI ? 'node .next/standalone/server.js' : 'npm run dev',
    reuseExistingServer: false,
    env: {
      ...server?.env,
      SESSION_LIMITS_JSON: '{}',
    },
  },
})
