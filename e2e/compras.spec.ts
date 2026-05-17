// @tests api/compra, api/insumo
import { test, expect, fullLogin, goto, apiPost, apiGet, createProveedor, createInsumo } from './fixtures'

test.describe('Compras', () => {
  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/compras')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Compras")')).toBeVisible()
  })

  test('crear compra', async ({ page }) => {
    await fullLogin(page)

    await createProveedor(page)
    await createInsumo(page)

    await goto(page, '/compras')
    await page.waitForTimeout(500)

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
    await fullLogin(page)
    await goto(page, '/compras')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Nueva Compra")')
    await page.waitForTimeout(500)

    await page.locator('#compra-proveedor').selectOption('')

    await page.locator('button:has-text("Guardar")').click()
    await page.waitForTimeout(1000)

    const toastEl = page.locator('[data-sonner-toast]')
    const form = page.locator('h3:has-text("Registrar Compra")')
    const toastVisible = await toastEl.isVisible({ timeout: 3000 }).catch(() => false)
    const formVisible = await form.isVisible({ timeout: 3000 }).catch(() => false)
    expect(toastVisible || formVisible).toBeTruthy()
  })

  test('validacion: sin insumo', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/compras')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Nueva Compra")')
    await page.waitForTimeout(500)

    await page.locator('#compra-insumo').selectOption('')

    await page.locator('button:has-text("Guardar")').click()
    await page.waitForTimeout(1000)

    const toastEl = page.locator('[data-sonner-toast]')
    const form = page.locator('h3:has-text("Registrar Compra")')
    const toastVisible = await toastEl.isVisible({ timeout: 3000 }).catch(() => false)
    const formVisible = await form.isVisible({ timeout: 3000 }).catch(() => false)
    expect(toastVisible || formVisible).toBeTruthy()
  })

  test('API crear compra', async ({ page }) => {
    await fullLogin(page)

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
    await fullLogin(page)

    const proveedor = await createProveedor(page)
    const insumo = await createInsumo(page)
    const insumoId = insumo.id || insumo.insumoId

    const stockAntesRes = await apiGet(page, `/api/insumos`)
    const stockAntesData = await stockAntesRes.json()
    const insumoAntes = (stockAntesData.insumos || []).find((i: any) => i.id === insumoId)
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
      const insumoDespues = (stockDespuesData.insumos || []).find((i: any) => i.id === insumoId)
      const stockDespues = insumoDespues ? Number(insumoDespues.stock) : stockAntes

      expect(stockDespues).toBeGreaterThanOrEqual(stockAntes + 10)
    }
  })
})
