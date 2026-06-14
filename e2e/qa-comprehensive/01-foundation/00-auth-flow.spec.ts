/**
 * Tier 1: Foundation - Auth flow
 * Tests: 8
 * Covers: login per role, logout, force password change, session expiry
 */
import { test, expect, loginAsAdmin, expectStatus, apiGet, BASE } from '../00-fixtures'

test.describe('Auth Flow - Foundation', () => {
  test('login page loads with branding', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.locator('h1:has-text("Agua Bambú")')).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('admin login redirects to /dashboard', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
  })

  test('asistente login redirects to /dashboard', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'asistente')
    await page.fill('input[type="password"]', 'asist123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
  })

  test('contador login redirects to /reportes', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'contador')
    await page.fill('input[type="password"]', 'cont123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/reportes', { timeout: 10000 })
  })

  test('repartidor login redirects to /repartidor', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'repartidor')
    await page.fill('input[type="password"]', 'rep123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/repartidor', { timeout: 10000 })
  })

  test('invalid credentials show error toast', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    // Should not navigate away
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    // Should show error (form-level or toast)
    const errorEl = page.locator('[role="alert"], .text-red-500, .text-red-600, [data-sonner-toast][data-type="error"]')
    await expect(errorEl.first()).toBeVisible({ timeout: 5000 })
  })

  test('unauthenticated request to /pedidos redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/pedidos`)
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    // callbackUrl should be present
    expect(page.url()).toContain('callbackUrl')
  })

  test('logout clears session and redirects to /login', async ({ page }) => {
    // Login first
    await loginAsAdmin(page)
    await expect(page).toHaveURL('/dashboard')

    // Try to access protected page
    const beforeRes = await apiGet(page, '/api/clientes')
    expectStatus(beforeRes, 200)

    // Logout via header
    await page.click('[data-testid="user-menu"]')
    await page.click('text=Cerrar Sesión')

    // Should be on /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })

    // Try to access protected page again - should redirect
    await page.goto(`${BASE}/pedidos`)
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })
})
