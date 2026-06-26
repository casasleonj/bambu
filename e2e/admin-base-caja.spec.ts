import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    // Clear the localStorage base value so the automatic modal checks the backend.
    await page.goto('/dashboard')
    await page.evaluate(() => {
      const today = new Date().toISOString().split('T')[0]
      localStorage.removeItem(`baseDia_${today}`)
    })
    await page.reload()

    // The automatic modal should open because there is no backend base.
    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').filter({ hasText: 'Base de Caja' })
    await expect(modal).toBeVisible({ timeout: 10000 })

    const input = modal.locator('#base-dia-input')
    await expect(input).toBeVisible()
    await input.fill('125000')
    await modal.getByRole('button', { name: /Continuar/i }).click()

    // Dashboard card should now show the registered amount.
    await expect(page.getByText('Base de caja')).toBeVisible()
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
