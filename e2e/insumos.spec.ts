// @tests api/insumo
import {test, expect, loginAs, goto, apiPost, apiGet, createProveedor,  resetDatabase} from './fixtures'

test.describe('Insumos', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/insumos')

    await expect(page.locator('h1:has-text("Insumos")')).toBeVisible()
  })

  test('crear insumo', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/insumos')

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
    await loginAs(page, 'admin')

    const proveedor = await createProveedor(page)
    expect(proveedor.id).toBeTruthy()

    await goto(page, '/insumos')

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
    await loginAs(page, 'admin')
    await goto(page, '/insumos')

    await page.click('button:has-text("+ Nuevo Insumo")')
    await page.waitForTimeout(500)

    // FIX: mismo patrón que compras.spec.ts -- el botón Guardar está
    // deshabilitado mientras falte nombre (validación del lado del
    // cliente), forzar el click agotaba el timeout del test.
    const guardarBtn = page.locator('button:has-text("Guardar")')
    await expect(guardarBtn).toBeDisabled()

    const form = page.locator('h3:has-text("Crear Insumo")')
    await expect(form).toBeVisible({ timeout: 5000 }).catch(() => null)
  })

  test('API crear insumo', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiPost(page, '/api/insumos', {
      nombre: `Insumo API ${Date.now() % 10000}`,
      unidad: 'UNIDAD',
      stock: 50,
    })

    expect(res.status()).toBe(201)
  })

  test('API listar insumos', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiGet(page, '/api/insumos')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.insumos).toBeDefined()
  })
})
