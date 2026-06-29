import { test, expect } from '@playwright/test'

test.describe('push opt-in toast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
  })

  test('muestra el toast de opt-in al iniciar sesion', async ({ page }) => {
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).toContainText('Activar notificaciones')
  })

  test('el boton Mas tarde oculta el toast', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-toast"] button:has-text("Más tarde")')
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })

  test('el toast no vuelve a aparecer en la misma sesion', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-toast"] button:has-text("Más tarde")')
    await page.reload()
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })
})
