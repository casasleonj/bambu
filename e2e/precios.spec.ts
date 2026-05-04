import { test, expect, type Page } from '@playwright/test'

test.describe('Precios', () => {
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

  test('page loads with price table', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/precios')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    await expect(page.locator('h1:has-text("Configuracion de Precios")')).toBeVisible()
    // Price tables should be visible (either volume cards or unitario table)
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 })
  })

  test('price table shows product names', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/precios')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    // At least one product name should appear in the page content
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Bolsa|Botellón|Paca|Hielo|Agua/i)
  })

  test('can edit a price inline', async ({ page }) => {
    await handleBaseCajaModal(page)
    await page.goto('/precios')
    await page.waitForTimeout(2000)
    await handleBaseCajaModal(page)

    // Click first "Editar" button on a price
    const editBtn = page.locator('button:has-text("Editar")').first()
    if (await editBtn.count() > 0) {
      await editBtn.click()
      await page.waitForTimeout(300)

      // An inline input should appear (shadcn Input renders native input in edit mode)
      const priceInput = page.locator('input[type="number"]').first()
      await expect(priceInput).toBeVisible()
    }
  })
})
