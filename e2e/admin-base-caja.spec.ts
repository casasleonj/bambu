import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await login(page, 'admin', 'admin123')
  })

  test('admin puede registrar y editar la base de caja desde el dashboard', async ({ page }) => {
    // With no base registered, the modal opens automatically after login.
    await expect(page.getByText('Base de Caja')).toBeVisible()
    await page.locator('#base-dia-input').fill('125000')
    await page.getByRole('button', { name: /Continuar/i }).click()

    // Once saved, dashboard should show the registered amount.
    await expect(page.getByText('Base de caja hoy')).toBeVisible()
    await expect(page.getByText(/125\.000/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar base/i })).toBeVisible()

    // Edit the base amount.
    await page.getByRole('button', { name: /Editar base/i }).click()
    await page.locator('#base-dia-input').fill('150000')
    await page.getByRole('button', { name: /Guardar cambios/i }).click()

    // Dashboard should reflect the updated amount.
    await expect(page.getByText(/150\.000/)).toBeVisible()
  })
})
