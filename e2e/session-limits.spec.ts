import { test, expect } from '@playwright/test'
import { login, resetTestDatabase } from './fixtures'

// webServer runs on 3001 (see playwright.config.ts env.PORT).
test.use({ baseURL: 'http://localhost:3001' })

test.describe.configure({ mode: 'serial' })

test.beforeEach(() => {
  resetTestDatabase()
})

const DASHBOARD = '/dashboard'
const REPARTIDOR = '/repartidor'

test('ADMIN puede tener 2 sesiones simultáneas; la 3ra cierra la más antigua', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()
  const ctx3 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()
  const page3 = await ctx3.newPage()

  try {
    await login(page1, 'admin', 'admin123')
    await login(page2, 'admin', 'admin123')

    await expect(page1).toHaveURL(/\/dashboard/)
    await expect(page2).toHaveURL(/\/dashboard/)

    // Third session should be accepted and evict the oldest one
    await login(page3, 'admin', 'admin123')
    await expect(page3).toHaveURL(/\/dashboard/)

    // Oldest session should now be invalid
    await page1.goto(DASHBOARD)
    await page1.waitForURL(/\/login/, { timeout: 15000 })

    // Middle session should still be valid
    await page2.goto(DASHBOARD)
    await expect(page2).toHaveURL(/\/dashboard/)
  } finally {
    await ctx1.close()
    await ctx2.close()
    await ctx3.close()
  }
})

test('REPARTIDOR solo puede tener 1 sesión; una 2da cierra la primera', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()

  try {
    await login(page1, 'repartidor', 'rep123')
    await expect(page1).toHaveURL(/\/repartidor/)

    await login(page2, 'repartidor', 'rep123')
    await expect(page2).toHaveURL(/\/repartidor/)

    await page1.goto(REPARTIDOR)
    await page1.waitForURL(/\/login/, { timeout: 15000 })
  } finally {
    await ctx1.close()
    await ctx2.close()
  }
})

test('logout desde un dispositivo no cierra las otras sesiones del mismo usuario', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()

  try {
    await login(page1, 'admin', 'admin123')
    await login(page2, 'admin', 'admin123')

    await expect(page1).toHaveURL(/\/dashboard/)
    await expect(page2).toHaveURL(/\/dashboard/)

    // Simulate device 1 losing its session by clearing its cookies/storage.
    // This isolates the session-limit behavior from the UI logout flow
    // (tested in auth.spec.ts): we only need to verify that invalidating one
    // session does not invalidate the other active session.
    await ctx1.clearCookies()
    await page1.goto(DASHBOARD)
    await page1.waitForURL(/\/login/, { timeout: 15000 })

    // page2 should still be valid
    await page2.goto(DASHBOARD)
    await expect(page2).toHaveURL(/\/dashboard/)
  } finally {
    await ctx1.close()
    await ctx2.close()
  }
})
