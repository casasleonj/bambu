import { test, expect, type Page } from '@playwright/test'

test.describe('Gastos', () => {
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
    await page.goto('/gastos')
    await page.waitForSelector('h1:has-text("Gastos")', { timeout: 15000 })
  })

  test('page loads and shows gastos', async ({ page }) => {
    await expect(page.locator('h1:has-text("Gastos")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Gasto")')).toBeVisible()
  })

  test('crear gasto, verificar en lista y total actualizado', async ({ page }) => {
    await page.locator('button:has-text("Nuevo Gasto")').click()
    await page.waitForSelector('h3:has-text("Registrar Gasto")', { timeout: 5000 })

    const categoriaSelect = page.locator('select').first()
    await expect(categoriaSelect).toHaveValue('OTRO')

    await page.getByPlaceholder('Detalle del gasto').fill('Test expense')
    await page.locator('input[type="number"]').first().fill('50000')

    // Intercept POST and GET responses
    const [postResponse] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/gastos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(postResponse.status()).toBe(201)

    // Wait for fetchGastos to complete and render the gasto list
    // After POST, the new gasto should appear with "Total Gastos:" label
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Total Gastos:')
    }, { timeout: 10000 })

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Test expense')
    expect(bodyText).toMatch(/Total Gastos/)
    expect(bodyText).toMatch(/\$[\d,.]+/)
  })

  test('validacion: formulario vacio muestra error', async ({ page }) => {
    await page.locator('button:has-text("Nuevo Gasto")').click()
    await page.waitForSelector('h3:has-text("Registrar Gasto")', { timeout: 5000 })

    await page.locator('input[type="number"]').first().fill('5000')
    await page.locator('button:has-text("Guardar")').click()
    await page.waitForTimeout(1000)

    const toastEl = page.locator('[data-sonner-toast]')
    if (await toastEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(toastEl).toContainText(/Descripción y monto/i)
    } else {
      await expect(page.locator('h3:has-text("Registrar Gasto")')).toBeVisible()
    }
  })
})
