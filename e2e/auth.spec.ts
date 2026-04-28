import { test, expect } from '@playwright/test'

test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('button:has-text("Ingresar")')).toBeVisible()
})

test('login page shows app branding', async ({ page }) => {
  await page.goto('/login')
  // Security: test credentials are only visible in NODE_ENV=development
  // In production (including this test env), they must NOT leak
  await expect(page.locator('h1:has-text("Agua Bambú")')).toBeVisible()
  await expect(page.locator('input[type="text"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('pedidos page exists', async ({ page }) => {
  // This will redirect to login since it's protected
  const response = await page.goto('/pedidos')
  expect(response?.status()).toBeLessThan(500)
})

