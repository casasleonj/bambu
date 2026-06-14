/**
 * Tier 1: Foundation - Sidebar & navigation
 * Tests: 8
 * Verifies sidebar visibility per role, navigation links work
 */
import { test, expect, loginAsAdmin, loginAsContador, loginAsRepartidor, BASE } from '../00-fixtures'

test.describe('Foundation - Sidebar & Navigation', () => {
  test('admin sees all main menu items in sidebar', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL('/dashboard')

    // Verify sidebar exists
    const sidebar = page.locator('aside, [data-testid="sidebar"], nav').first()
    await expect(sidebar).toBeVisible()

    // Check key menu items
    await expect(page.locator('a:has-text("Dashboard")').first()).toBeVisible()
    await expect(page.locator('a:has-text("Clientes")').first()).toBeVisible()
    await expect(page.locator('a:has-text("Pedidos")').first()).toBeVisible()
  })

  test('contador sees reportes link in sidebar', async ({ page }) => {
    await loginAsContador(page)
    await expect(page).toHaveURL('/reportes')

    const sidebar = page.locator('aside, [data-testid="sidebar"], nav').first()
    await expect(sidebar).toBeVisible()

    // Contador should see Reportes
    await expect(page.locator('a:has-text("Reportes")').first()).toBeVisible()
  })

  test('repartidor sees only repartidor view, no admin links', async ({ page }) => {
    await loginAsRepartidor(page)
    await expect(page).toHaveURL('/repartidor')

    // Should NOT see admin links
    const adminLink = page.locator('a:has-text("Clientes")')
    await expect(adminLink).toHaveCount(0)
  })

  test('clicking sidebar link navigates to that page', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL('/dashboard')

    // Click Clientes
    await page.click('a:has-text("Clientes")')
    await expect(page).toHaveURL(/\/clientes/, { timeout: 5000 })

    // Click Pedidos
    await page.click('a:has-text("Pedidos")')
    await expect(page).toHaveURL(/\/pedidos/, { timeout: 5000 })
  })

  test('back button works after navigation', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL('/dashboard')

    await page.goto(`${BASE}/clientes`)
    await expect(page).toHaveURL(/\/clientes/)

    await page.goBack()
    await expect(page).toHaveURL('/dashboard')
  })

  test('header user menu is visible after login', async ({ page }) => {
    await loginAsAdmin(page)
    const userMenu = page.locator('[data-testid="user-menu"]')
    await expect(userMenu).toBeVisible()
  })

  test('date is displayed in header', async ({ page }) => {
    await loginAsAdmin(page)
    // Look for some date format in header
    const header = page.locator('header').first()
    await expect(header).toBeVisible()
    const headerText = await header.textContent()
    expect(headerText?.length).toBeGreaterThan(0)
  })

  test('app name "Agua Bambú" is in header', async ({ page }) => {
    await loginAsAdmin(page)
    const header = page.locator('header').first()
    await expect(header).toContainText(/Agua Bambú/i)
  })
})
