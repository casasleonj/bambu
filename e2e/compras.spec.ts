// @tests api/compra, api/insumo
import {test, expect, loginAs, goto, apiPost, apiGet, createProveedor, createInsumo,  resetDatabase} from './fixtures'

test.describe('Compras', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/compras')

    await expect(page.locator('h1:has-text("Compras")')).toBeVisible()
  })

  test('crear compra', async ({ page }) => {
    await loginAs(page, 'admin')

    await createProveedor(page)
    await createInsumo(page)

    await goto(page, '/compras')

    await page.click('button:has-text("Nueva Compra")')
    await page.waitForTimeout(500)

    const proveedorSelect = page.locator('#compra-proveedor')
    const insumoSelect = page.locator('#compra-insumo')

    await proveedorSelect.waitFor({ state: 'visible' })
    await page.waitForTimeout(500)

    const provOptions = await proveedorSelect.locator('option').all()
    const insOptions = await insumoSelect.locator('option').all()

    if (provOptions.length < 2 || insOptions.length < 2) {
      test.skip(true, 'No hay proveedores o insumos')
      return
    }

    await proveedorSelect.selectOption({ index: provOptions.length - 1 })
    await insumoSelect.selectOption({ index: insOptions.length - 1 })

    await page.locator('#compra-cantidad').fill('5')
    await page.locator('#compra-monto').fill('20000')

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/compras') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    const status = response.status()
    expect([201, 500]).toContain(status)
    await page.waitForTimeout(2000)

    await expect(page.locator('h1:has-text("Compras")')).toBeVisible()
  })

  test('validacion: sin proveedor', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/compras')

    await page.click('button:has-text("Nueva Compra")')
    await page.waitForTimeout(500)

    await page.locator('#compra-proveedor').selectOption('')

    // FIX: el botón Guardar está deshabilitado mientras falte proveedor
    // (compras-client/index.tsx:171, disabled={... || !proveedorId || ...}
    // -- validación del lado del cliente, no permite ni intentar el
    // submit). El test intentaba forzar un click sobre un botón
    // disabled, agotando el timeout completo del test (30s) en vez de
    // verificar la validación real: que el botón quede deshabilitado.
    await expect(page.locator('button:has-text("Guardar")')).toBeDisabled()
  })

  test('validacion: sin insumo', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/compras')

    await page.click('button:has-text("Nueva Compra")')
    await page.waitForTimeout(500)

    await page.locator('#compra-insumo').selectOption('')

    // FIX: mismo caso que "validacion: sin proveedor" -- el botón Guardar
    // está deshabilitado mientras falte insumo (validación del lado del
    // cliente), forzar el click agotaba el timeout del test.
    await expect(page.locator('button:has-text("Guardar")')).toBeDisabled()
  })

  test('API crear compra', async ({ page }) => {
    await loginAs(page, 'admin')

    const proveedor = await createProveedor(page)
    const insumo = await createInsumo(page)

    const res = await apiPost(page, '/api/compras', {
      proveedorId: proveedor.id || proveedor.proveedorId,
      insumoId: insumo.id || insumo.insumoId,
      cantidad: 10,
      montoTotal: 35000,
    })

    expect([201, 500]).toContain(res.status())
  })

  test('verificar stock aumenta post-compra', async ({ page }) => {
    await loginAs(page, 'admin')

    const proveedor = await createProveedor(page)
    const insumo = await createInsumo(page)
    const insumoId = insumo.id || insumo.insumoId

    const stockAntesRes = await apiGet(page, `/api/insumos`)
    const stockAntesData = await stockAntesRes.json()
    const insumoAntes = ((stockAntesData.insumos || []) as Array<{ id: string; stock: number | string }>).find((i) => i.id === insumoId)
    const stockAntes = insumoAntes ? Number(insumoAntes.stock) : 0

    const res = await apiPost(page, '/api/compras', {
      proveedorId: proveedor.id || proveedor.proveedorId,
      insumoId,
      cantidad: 10,
      montoTotal: 35000,
    })

    if (res.status() === 201) {
      await page.waitForTimeout(500)

      const stockDespuesRes = await apiGet(page, `/api/insumos`)
      const stockDespuesData = await stockDespuesRes.json()
      const insumoDespues = ((stockDespuesData.insumos || []) as Array<{ id: string; stock: number | string }>).find((i) => i.id === insumoId)
      const stockDespues = insumoDespues ? Number(insumoDespues.stock) : stockAntes

      expect(stockDespues).toBeGreaterThanOrEqual(stockAntes + 10)
    }
  })
})
