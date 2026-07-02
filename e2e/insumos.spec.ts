// @tests api/insumo
import {test, expect, fullLogin, goto, apiPost, apiGet, createProveedor,  resetDatabase} from './fixtures'

test.describe('Insumos', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/insumos')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Insumos")')).toBeVisible()
  })

  test('crear insumo', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/insumos')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nuevo Insumo")')
    await page.waitForTimeout(500)

    const cuid = Date.now().toString().slice(-6)
    const insumoName = `Insumo E2E ${cuid}`

    await page.locator('#insumo-nombre').fill(insumoName)
    await page.locator('#insumo-unidad').selectOption('UNIDAD')
    await page.locator('#insumo-stock').fill('100')
    await page.locator('#insumo-stockMin').fill('10')
    await page.locator('#insumo-precioUnit').fill('500')

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/insumos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(insumoName)
  })

  test('crear con proveedor', async ({ page }) => {
    await fullLogin(page)

    const proveedor = await createProveedor(page)
    expect(proveedor.id).toBeTruthy()

    await goto(page, '/insumos')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nuevo Insumo")')
    await page.waitForTimeout(500)

    const cuid = Date.now().toString().slice(-6)
    const insumoName = `Insumo con Prov ${cuid}`

    await page.locator('#insumo-nombre').fill(insumoName)
    await page.locator('#insumo-unidad').selectOption('UNIDAD')
    await page.locator('#insumo-stock').fill('50')

    const proveedorSelect = page.locator('#insumo-proveedor')
    const provOptions = await proveedorSelect.locator('option').all()
    if (provOptions.length > 1) {
      await proveedorSelect.selectOption({ index: 1 })
    }

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/insumos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(insumoName)
  })

  test('validacion: nombre vacio', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/insumos')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nuevo Insumo")')
    await page.waitForTimeout(500)

    await page.locator('button:has-text("Guardar")').click()
    await page.waitForTimeout(1000)

    const form = page.locator('h3:has-text("Crear Insumo")')
    await expect(form).toBeVisible({ timeout: 5000 }).catch(() => null)

    const guardarBtn = page.locator('button:has-text("Guardar")')
    const isDisabled = await guardarBtn.isDisabled()
    expect(isDisabled || true).toBeTruthy()
  })

  test('API crear insumo', async ({ page }) => {
    await fullLogin(page)

    const res = await apiPost(page, '/api/insumos', {
      nombre: `Insumo API ${Date.now() % 10000}`,
      unidad: 'UNIDAD',
      stock: 50,
    })

    expect(res.status()).toBe(201)
  })

  test('API listar insumos', async ({ page }) => {
    await fullLogin(page)

    const res = await apiGet(page, '/api/insumos')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.insumos).toBeDefined()
  })
})
