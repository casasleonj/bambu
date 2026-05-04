import { test, expect, type Page } from '@playwright/test'

test.describe('Proveedores', () => {
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
    await page.goto('/proveedores')
    await page.waitForSelector('h1:has-text("Proveedores")', { timeout: 15000 })
  })

  test('page loads and shows proveedores', async ({ page }) => {
    await expect(page.locator('h1:has-text("Proveedores")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo proveedor")')).toBeVisible()
  })

  test('crear proveedor y verificar en lista', async ({ page }) => {
    await page.locator('button:has-text("Nuevo proveedor")').click()
    await page.waitForSelector('[role="dialog"]:has(h2:has-text("Nuevo proveedor"))', { timeout: 5000 })

    const cuid = Date.now().toString().slice(-6)
    const provName = `Test Prov ${cuid}`

    await page.locator('#nombre').fill(provName)
    await page.locator('#telefono').fill('Test Contact')
    // Email must be valid (Zod .email() rejects empty/invalid)
    await page.locator('#email').fill(`prov-${cuid}@test.com`)

    // Intercept the POST response
    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/proveedores') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Crear proveedor")').click(),
    ])

    expect(response.status()).toBe(201)

    // Wait for in-place fetchProveedores to complete and UI to re-render
    await page.waitForTimeout(1500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(provName)
    expect(bodyText).toContain('Test Contact')
  })
})
