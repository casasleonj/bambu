import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const DB_PATH = path.resolve(__dirname, 'prisma', 'dev.db')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: `file:${DB_PATH}`,
      NEXTAUTH_SECRET: 'dev-secret-change-in-production',
      NEXTAUTH_URL: 'http://localhost:3000',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
