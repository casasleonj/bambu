import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    await page.goto('/dashboard')

    // Wait for the admin base card to load.
    await expect(page.getByText('Base de caja').first()).toBeVisible()

    // Initial state: no base registered.
    await expect(page.getByText('Aún no registrada')).toBeVisible()
    await page.getByRole('button', { name: /Registrar base/i }).click()

    // Fill and save the base amount.
    await page.locator('#base-dia-input').fill('125000')
    await page.getByRole('button', { name: /Continuar/i }).click()

    // Card should now show the registered amount.
    await expect(page.getByText(/125,000/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar base/i })).toBeVisible()

    // Edit the base amount.
    await page.getByRole('button', { name: /Editar base/i }).click()
    await page.locator('#base-dia-input').fill('150000')
    await page.getByRole('button', { name: /Guardar cambios/i }).click()

    // Card should reflect the updated amount.
    await expect(page.getByText(/150,000/)).toBeVisible()
  })
})
