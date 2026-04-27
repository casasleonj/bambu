import { test, expect } from '@playwright/test'

test('homepage loads and shows login', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('text=Iniciar sesión')).toBeVisible()
})

test('unauthenticated API access returns 401', async ({ page }) => {
  const response = await page.request.get('/api/pedidos')
  expect(response.status()).toBe(401)
})

test('unauthenticated clientes API returns 401', async ({ page }) => {
  const response = await page.request.get('/api/clientes')
  expect(response.status()).toBe(401)
})
