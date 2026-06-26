import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await login(page, 'admin', 'admin123')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    // With no base registered, the modal opens automatically after login.
    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').filter({ hasText: 'Base de Caja' })
    await expect(modal).toBeVisible({ timeout: 10000 })

    const input = modal.locator('#base-dia-input')
    await expect(input).toBeVisible()
    await input.fill('125000')

    await modal.getByRole('button', { name: /Continuar/i }).click()

    // Once saved, dashboard should show the registered amount.
    await expect(page.getByText('Base de caja hoy')).toBeVisible()
    await expect(page.getByText(/125\.000/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar base/i })).toBeVisible()

    // Edit the base amount.
    await page.getByRole('button', { name: /Editar base/i }).click()
    await expect(modal).toBeVisible()
    await input.fill('150000')
    await modal.getByRole('button', { name: /Guardar cambios/i }).click()

    // Dashboard should reflect the updated amount.
    await expect(page.getByText(/150\.000/)).toBeVisible()
  })
})
