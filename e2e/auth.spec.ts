import { test, expect } from '@playwright/test'

test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('button:has-text("Ingresar")')).toBeVisible()
})

test('login page has test users info', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('text=Usuarios de prueba:')).toBeVisible()
  await expect(page.locator('text=admin')).toBeVisible()
})

test('pedidos page exists', async ({ page }) => {
  // This will redirect to login since it's protected
  const response = await page.goto('/pedidos')
  expect(response?.status()).toBeLessThan(500)
})
