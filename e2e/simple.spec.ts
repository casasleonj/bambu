import { test, expect } from '@playwright/test'

test('simple test', async ({ page }) => {
  await page.goto('http://localhost:3000/login')
  await expect(page).toHaveTitle(/Agua Bambú/)
})
