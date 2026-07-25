// @tests api/auth
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

test('proxy redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login/)
})

test('login redirects admin to dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
})

test('signOut redirects to login', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 })

  // Dismiss the "Base de Caja" modal if it appears (ADMIN role).
  const baseCajaModal = page.locator('h2:has-text("Base de Caja")').first()
  if (await baseCajaModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.click('button:has-text("Guardar cambios")')
    await page.waitForTimeout(500)
  }

  // Use header dropdown (more stable than sidebar on mobile/desktop)
  await page.click('[data-testid="user-menu"]')
  await page.click('text=Cerrar Sesión')
  // The redirect may use 0.0.0.0 (AUTH_TRUST_HOST) or localhost,
  // so use a regex matcher instead of exact URL.
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
})

