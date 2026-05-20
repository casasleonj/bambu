import { test, expect } from '@playwright/test'
import { BASE, login, skipBaseCaja } from '../fixtures'

test.describe('Chaos - Debug', () => {
  test('login simple', async ({ page }) => {
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })
})
