import { test, expect, type Page } from '@playwright/test'

test.describe('Nómina', () => {
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

  test('page loads with heading', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/nomina')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await expect(page.locator('h1:has-text("Nómina")')).toBeVisible()
  })

  test('can open nueva nomina form', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/nomina')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    // Click the button to open the create form
    await page.click('button:has-text("Nueva Nómina")')
    await page.waitForTimeout(500)

    // Form should be visible with Calcular Nómina title
    await expect(page.locator('text=Calcular Nómina')).toBeVisible()

    // The select for trabajador should be visible
    const select = page.locator('select').first()
    await expect(select).toBeVisible()

    // The AUTO calculation button should be visible
    await expect(page.locator('button:has-text("Calcular Automático")')).toBeVisible()
  })

  test('create payroll with AUTO calculation', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/nomina')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    // Open create form
    await page.click('button:has-text("Nueva Nómina")')
    await page.waitForTimeout(500)

    // Select first trabajador from the dropdown
    const select = page.locator('select').first()
    await select.waitFor({ state: 'visible' })
    const options = select.locator('option')
    const optionCount = await options.count()
    if (optionCount > 1) {
      await select.selectOption({ index: 1 })
      await page.waitForTimeout(300)

      // Set date range (current month)
      const fechaInicio = page.locator('input[type="date"]').first()
      const fechaFin = page.locator('input[type="date"]').nth(1)
      await fechaInicio.fill('2026-05-01')
      await fechaFin.fill('2026-05-31')

      // Click calcular
      await page.click('button:has-text("Calcular Automático")')
      await page.waitForTimeout(2000)

      // Either success (details card or new nomina card appears) or error toast
      // Success: the form should close or details card should appear
      const hasResult = await page.locator('text=TOTAL:').count()
      const hasNomina = await page.locator('text=Período').count()
      expect(hasResult + hasNomina).toBeGreaterThan(0)
    } else {
      // No workers available - form should still be visible
      await expect(page.locator('text=Calcular Nómina')).toBeVisible()
    }
  })
})
