import { test, expect, type Page } from '@playwright/test'

test.describe('Insumos', () => {
  test.setTimeout(60000)

  async function login(page: Page, username: string, password: string) {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('baseDiaDate', new Date().toISOString().split('T')[0])
      localStorage.setItem('baseDia', '50000')
    })
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await page.goto('/insumos')
    await page.waitForSelector('h1:has-text("Insumos")', { timeout: 15000 })
  })

  test('page loads and shows insumos', async ({ page }) => {
    await expect(page.locator('h1:has-text("Insumos")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Insumo")')).toBeVisible()
  })

  test('crear insumo y verificar en lista', async ({ page }) => {
    await page.locator('button:has-text("Nuevo Insumo")').click()
    await page.waitForSelector('h3:has-text("Crear Insumo")', { timeout: 5000 })

    const cuid = Date.now().toString().slice(-6)
    const insumoName = `Test Insumo ${cuid}`

    await page.locator('#insumo-nombre').fill(insumoName)
    await page.locator('#insumo-unidad').selectOption('UNIDAD')
    await page.locator('#insumo-stock').fill('100')
    await page.locator('#insumo-stockMin').fill('10')
    await page.locator('#insumo-precioUnit').fill('500')

    // Select first proveedor to avoid empty proveedorId validation error
    const proveedorSelect = page.locator('#insumo-proveedor')
    const provOptions = await proveedorSelect.locator('option').all()
    if (provOptions.length > 1) {
      const provValue = await provOptions[1].getAttribute('value')
      if (provValue) await proveedorSelect.selectOption(provValue)
    }

    // Intercept the POST response
    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/insumos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)

    // Wait for in-place fetchData to complete and UI to re-render
    await page.waitForTimeout(1500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(insumoName)
  })
})
