import { test, expect } from '@playwright/test'

test.describe('push settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
    await page.goto('/configuracion')
  })

  test('muestra seccion de notificaciones push', async ({ page }) => {
    await expect(page.locator('h2:has-text("Notificaciones push")')).toBeVisible()
    await expect(page.locator('[data-testid="push-settings"]')).toBeVisible()
  })

  test('no muestra banner de notificaciones en el header', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="push-permission-banner"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="header-push-settings"]')).not.toBeVisible()
  })

  test('no muestra controles de push en el sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="sidebar-push-settings"]')).not.toBeVisible()
  })
})
