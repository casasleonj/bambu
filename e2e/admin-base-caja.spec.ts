import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await page.goto('/dashboard')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    await expect(page.getByText('Base de caja')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Aún no registrada')).toBeVisible()

    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').filter({ hasText: 'Base de Caja' })

    // The modal may open automatically (no backend base) or we open it manually.
    try {
      await expect(modal).toBeVisible({ timeout: 3000 })
    } catch {
      await page.getByRole('button', { name: /Registrar base/i }).click()
      await expect(modal).toBeVisible({ timeout: 10000 })
    }

    const input = modal.locator('#base-dia-input')
    await expect(input).toBeVisible()
    await input.fill('125000')
    await modal.getByRole('button', { name: /Continuar/i }).click()

    // Dashboard card should now show the registered amount.
    await expect(page.getByText(/125\.000/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar base/i })).toBeVisible()

    // Edit the base amount.
    await page.getByRole('button', { name: /Editar base/i }).click()
    await expect(modal).toBeVisible()
    await input.fill('150000')
    await modal.getByRole('button', { name: /Guardar cambios/i }).click()

    await expect(page.getByText(/150\.000/)).toBeVisible()
  })
})
