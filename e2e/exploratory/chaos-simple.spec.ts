import { test, expect } from '@playwright/test'
import { BASE, resetTestDatabase, loginAs } from '../fixtures'

test.describe('Chaos - Simple', () => {
  test.beforeEach(() => {
    resetTestDatabase()
  })

  test('login y navegación básica', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)
    expect(page.url()).toMatch(/dashboard|cierre/)
  })

  test('Escape en cierre no rompe', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE}/cierre`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)
    }

    await page.waitForTimeout(500)
    expect(page.url()).toContain('/cierre')
  })
})
