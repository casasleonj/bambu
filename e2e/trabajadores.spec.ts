import { test, expect, type Page } from '@playwright/test'

test.describe('Trabajadores', () => {
  async function login(page: Page, username: string, password: string) {
    await page.goto('/login')
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  async function handleBaseCajaModal(page: Page) {
    const baseCajaBtn = page.locator('button:has-text("Continuar →")')
    if (await baseCajaBtn.count() > 0) {
      await page.fill('input[type="number"]', '50000')
      await baseCajaBtn.click()
      await page.waitForTimeout(500)
    }
  }

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', 'admin123')
  })

  test('page loads', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/trabajadores')
    await page.waitForTimeout(2000)
    await expect(page.locator('h1:has-text("Trabajadores")')).toBeVisible()
  })

  test('create a new worker and verify in list', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/trabajadores')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await page.click('button:has-text("+ Nuevo Trabajador")')
    await page.waitForTimeout(500)

    await page.fill('#trabajador-nombre', 'Test Trabajador E2E')
    await page.selectOption('#trabajador-rol', 'REPARTIDOR')
    await page.fill('#trabajador-telefono', '3001112233')

    await page.click('button:has-text("Guardar")')
    await page.waitForTimeout(1500)

    // Modal should be closed (worker created)
    await expect(page.locator('h2:has-text("Nuevo Trabajador")')).not.toBeVisible({ timeout: 3000 })

    // Reload to ensure fresh data
    await page.reload()
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Test Trabajador E2E')
    expect(bodyText).toContain('Repartidor')
  })

  test('usaMoto checkbox shows capacity field', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/trabajadores')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await page.click('button:has-text("+ Nuevo Trabajador")')
    await page.waitForTimeout(500)

    // Capacity field should NOT be visible initially
    await expect(page.locator('#trabajador-capacidadKg')).not.toBeVisible()

    // Check usaMoto
    await page.check('#usaMoto')
    await page.waitForTimeout(300)

    // Capacity field should now be visible with default value
    await expect(page.locator('#trabajador-capacidadKg')).toBeVisible()
    await expect(page.locator('#trabajador-capacidadKg')).toHaveValue('500')
  })
})
