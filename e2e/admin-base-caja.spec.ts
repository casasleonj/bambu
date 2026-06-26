import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await page.goto('/dashboard')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    await expect(page.getByText('Base de caja')).toBeVisible({ timeout: 10000 })

    // With no backend base registered the card shows "Aún no registrada".
    await expect(page.getByText('Aún no registrada')).toBeVisible()
    await page.getByRole('button', { name: /Registrar base/i }).click()

    const modal = page.locator('div.fixed.inset-0.bg-black\\/50').filter({ hasText: 'Base de Caja' })
    await expect(modal).toBeVisible()
    await expect(modal.locator('#base-dia-input')).toBeVisible()
    await modal.locator('#base-dia-input').fill('125000')
    await modal.getByRole('button', { name: /Continuar/i }).click()

    await expect(page.getByText(/125\.000/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar base/i })).toBeVisible()

    // Edit the base amount.
    await page.getByRole('button', { name: /Editar base/i }).click()
    await expect(modal).toBeVisible()
    await modal.locator('#base-dia-input').fill('150000')
    await modal.getByRole('button', { name: /Guardar cambios/i }).click()

    await expect(page.getByText(/150\.000/)).toBeVisible()
  })
})
