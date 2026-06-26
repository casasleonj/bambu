import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

test.describe('Admin - Base de caja editable en dashboard', () => {
  test('muestra card de base de caja para admin', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await page.goto('/dashboard')

    await expect(page.getByText('Base de caja')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Registrar base|Editar base/i })).toBeVisible()
  })
})
